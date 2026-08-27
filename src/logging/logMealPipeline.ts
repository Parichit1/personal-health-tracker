import { services } from '../services';
import { convertToGrams, normalizeUnit } from '../nutrition/unitConversion';
import { findCachedByQuery, createFoodItem } from '../db/repositories/foodItems.repo';
import { findOrCreateRecipe } from '../db/repositories/recipes.repo';
import { saveMeal, type SaveMealIngredientInput } from '../db/repositories/meals.repo';
import type { MealType, ParsedIngredient, RawOrCooked } from '../services/ai/AIParsingService';
import type { FoodDetails } from '../services/nutrition/NutritionDataSource';

/**
 * Thrown only for whole-draft failures (the AI couldn't parse the message
 * at all, or you try to confirm a draft that still has unresolved
 * ingredients). Per-ingredient resolution problems no longer throw — they
 * become a `needsClarification` ingredient instead, resolved via
 * resolveClarificationAnswer/resolveWithEstimate.
 */
export class MealDraftError extends Error {}

export interface DraftIngredient {
  nameAsLogged: string;
  /** null for "stated"/estimated/pending ingredients — there's no measurable amount. */
  quantity: number | null;
  unit: string | null;
  rawOrCooked: RawOrCooked;
  resolvedDescription: string;
  isApproximateConversion: boolean;
  /** True when this ingredient's numbers came directly from the user, never looked up. */
  isUserStated: boolean;
  /** True when this ingredient's numbers are an AI estimate the user explicitly asked for, never looked up or stated. */
  isEstimated: boolean;
  /** True when this ingredient couldn't be resolved yet and needs an answer or an estimate before the meal can be saved. */
  needsClarification: boolean;
  /** 1 = ate all of the stated/measured amount. Less than 1 when the user said they only ate part of it; already baked into caloriesKcal/proteinG/etc below. */
  fractionEaten: number;
  /** null for "stated"/estimated/pending ingredients — nothing was resolved against food_items. */
  foodItemId: number | null;
  caloriesKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

export interface MealDraft {
  sourceText: string;
  inputMethod: 'typed' | 'voice';
  mealType: MealType;
  name: string;
  ingredients: DraftIngredient[];
  totalCalories: number;
  totalProteinG: number;
  totalCarbsG: number;
  totalFatG: number;
  totalFiberG: number;
}

/**
 * Cache key includes raw/cooked state — raw and cooked chicken have
 * meaningfully different nutrition profiles, so "chicken breast|cooked" and
 * "chicken breast|raw" must never share a cache entry.
 */
function buildCacheKey(name: string, rawOrCooked: RawOrCooked): string {
  return `${name.trim().toLowerCase()}|${rawOrCooked}`;
}

async function resolveFoodDetails(
  ingredientName: string,
  rawOrCooked: RawOrCooked,
): Promise<{ details: FoodDetails; foodItemId: number }> {
  const cacheKey = buildCacheKey(ingredientName, rawOrCooked);

  const cached = await findCachedByQuery(cacheKey);
  if (cached) {
    return {
      foodItemId: cached.id,
      details: {
        externalId: cached.externalId ?? '',
        description: cached.description,
        dataType: cached.dataType ?? '',
        caloriesPer100g: cached.caloriesPer100g,
        proteinPer100g: cached.proteinPer100g,
        carbsPer100g: cached.carbsPer100g,
        fatPer100g: cached.fatPer100g,
        fiberPer100g: cached.fiberPer100g,
        // Portions aren't cached (only needed for non-universal units) —
        // re-fetched from USDA on demand below if needed.
        portions: [],
      },
    };
  }

  // Including the raw/cooked qualifier in the actual search text measurably
  // improves USDA's match quality (e.g. surfaces "cooked, roasted" chicken
  // breast entries instead of raw ones) on top of the relevance re-ranking
  // in pickBestMatch.
  const searchQuery = rawOrCooked !== 'unspecified' ? `${ingredientName} ${rawOrCooked}` : ingredientName;

  const resolved = await services.nutrition.resolveBestMatch(searchQuery);
  if (!resolved) {
    throw new MealDraftError(`Couldn't find nutrition data for "${ingredientName}" in USDA FoodData Central.`);
  }

  const created = await createFoodItem({
    source: 'usda',
    externalId: resolved.externalId,
    description: resolved.description,
    brand: null,
    dataType: resolved.dataType,
    caloriesPer100g: resolved.caloriesPer100g,
    proteinPer100g: resolved.proteinPer100g,
    carbsPer100g: resolved.carbsPer100g,
    fatPer100g: resolved.fatPer100g,
    fiberPer100g: resolved.fiberPer100g,
    rawOrCooked,
    lastFetchedAt: new Date().toISOString(),
    matchedQueries: JSON.stringify([cacheKey]),
  });

  return { foodItemId: created.id, details: resolved };
}

function needsClarificationIngredient(name: string, rawOrCooked: RawOrCooked, reason: string): DraftIngredient {
  return {
    nameAsLogged: name,
    quantity: null,
    unit: null,
    rawOrCooked,
    resolvedDescription: reason,
    isApproximateConversion: false,
    isUserStated: false,
    isEstimated: false,
    needsClarification: true,
    fractionEaten: 1,
    foodItemId: null,
    caloriesKcal: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    fiberG: 0,
  };
}

/**
 * Core resolution logic — may throw MealDraftError for problems deeper than
 * "insufficient info" (no USDA match, unrecognized unit). Only called
 * through resolveIngredient below, which converts any such failure into a
 * needsClarification result instead of letting it fail the whole draft.
 */
async function resolveParsedIngredientOrThrow(ingredient: ParsedIngredient): Promise<DraftIngredient> {
  if (ingredient.mode === 'stated') {
    if (ingredient.statedCalories == null) {
      return needsClarificationIngredient(
        ingredient.name,
        ingredient.rawOrCooked,
        'No quantity or calorie value was given for this item.',
      );
    }

    const fraction = ingredient.fractionEaten;
    return {
      nameAsLogged: ingredient.name,
      quantity: null,
      unit: null,
      rawOrCooked: 'unspecified',
      resolvedDescription: 'as you stated (not looked up)',
      isApproximateConversion: false,
      isUserStated: true,
      isEstimated: false,
      needsClarification: false,
      fractionEaten: fraction,
      foodItemId: null,
      caloriesKcal: ingredient.statedCalories * fraction,
      proteinG: (ingredient.statedProteinG ?? 0) * fraction,
      carbsG: (ingredient.statedCarbsG ?? 0) * fraction,
      fatG: (ingredient.statedFatG ?? 0) * fraction,
      fiberG: (ingredient.statedFiberG ?? 0) * fraction,
    };
  }

  if (ingredient.quantity == null || ingredient.unit == null) {
    return needsClarificationIngredient(
      ingredient.name,
      ingredient.rawOrCooked,
      'No quantity or calorie value was given for this item.',
    );
  }
  const quantity = ingredient.quantity;
  const unit = ingredient.unit;

  const { details, foodItemId } = await resolveFoodDetails(ingredient.name, ingredient.rawOrCooked);

  let grams: number;
  let isApproximateConversion: boolean;

  const universal = convertToGrams(quantity, unit);
  if (universal) {
    grams = universal.grams;
    isApproximateConversion = universal.isApproximate;
  } else {
    // Non-universal unit (piece, slice, medium, ...) — needs this specific
    // food's USDA household-unit portions, not cached, so fetch on demand.
    const detail = await services.nutrition.getFoodDetails(details.externalId);
    const normalizedUnit = normalizeUnit(unit);
    const portion = detail.portions.find((p) => p.unitLabel.toLowerCase().includes(normalizedUnit));
    if (!portion) {
      throw new MealDraftError(`Don't know how many grams a "${unit}" of "${ingredient.name}" is.`);
    }
    grams = portion.gramWeight * quantity;
    isApproximateConversion = true;
  }

  // The stated quantity/unit reflects how much was made/served; the eaten
  // fraction is applied on top, on the resulting nutrition, so the preview
  // can show both the stated amount and what was actually consumed.
  const factor = (grams / 100) * ingredient.fractionEaten;

  return {
    nameAsLogged: ingredient.name,
    quantity,
    unit,
    rawOrCooked: ingredient.rawOrCooked,
    resolvedDescription: details.description,
    isApproximateConversion,
    isUserStated: false,
    isEstimated: false,
    needsClarification: false,
    fractionEaten: ingredient.fractionEaten,
    foodItemId,
    caloriesKcal: details.caloriesPer100g * factor,
    proteinG: details.proteinPer100g * factor,
    carbsG: details.carbsPer100g * factor,
    fatG: details.fatPer100g * factor,
    fiberG: details.fiberPer100g * factor,
  };
}

/**
 * Resolves one parsed ingredient into a DraftIngredient. Never throws for
 * resolution problems (missing info, no USDA match, unknown unit) — those
 * become a needsClarification ingredient so one problem item doesn't block
 * the rest of the meal from being previewed. Ingredients are independent of
 * each other, so parseMealDraft resolves them concurrently.
 */
async function resolveIngredient(ingredient: ParsedIngredient): Promise<DraftIngredient> {
  try {
    return await resolveParsedIngredientOrThrow(ingredient);
  } catch (err) {
    if (err instanceof MealDraftError) {
      return needsClarificationIngredient(ingredient.name, ingredient.rawOrCooked, err.message);
    }
    throw err;
  }
}

export function computeTotals(ingredients: DraftIngredient[]) {
  let totalCalories = 0;
  let totalProteinG = 0;
  let totalCarbsG = 0;
  let totalFatG = 0;
  let totalFiberG = 0;
  for (const ing of ingredients) {
    totalCalories += ing.caloriesKcal;
    totalProteinG += ing.proteinG;
    totalCarbsG += ing.carbsG;
    totalFatG += ing.fatG;
    totalFiberG += ing.fiberG;
  }
  return { totalCalories, totalProteinG, totalCarbsG, totalFatG, totalFiberG };
}

/**
 * Parse -> resolve -> compute. Writes nothing to the database. Only throws
 * if the AI call itself fails (message couldn't be understood at all) —
 * per-ingredient problems show up as needsClarification ingredients instead.
 */
export async function parseMealDraft(
  sourceText: string,
  inputMethod: 'typed' | 'voice',
): Promise<MealDraft> {
  const loggedAt = new Date().toISOString();
  const parsed = await services.ai.parseMeal(sourceText, { loggedAt });

  // Ingredients don't depend on each other, so resolve them concurrently.
  const draftIngredients = await Promise.all(parsed.ingredients.map(resolveIngredient));
  const totals = computeTotals(draftIngredients);

  return {
    sourceText,
    inputMethod,
    mealType: parsed.mealType,
    name: parsed.name,
    ingredients: draftIngredients,
    ...totals,
  };
}

/** Re-resolves one pending ingredient from the user's free-text answer to a clarification prompt. May itself come back needing clarification again if the answer was still insufficient. */
export async function resolveClarificationAnswer(
  itemName: string,
  rawOrCooked: RawOrCooked,
  answerText: string,
): Promise<DraftIngredient> {
  const parsed = await services.ai.parseClarification(itemName, answerText);
  const merged: ParsedIngredient = {
    ...parsed,
    rawOrCooked: parsed.rawOrCooked !== 'unspecified' ? parsed.rawOrCooked : rawOrCooked,
  };
  return resolveIngredient(merged);
}

/** Only ever called when the user explicitly taps "estimate for me" — never automatically. */
export async function resolveWithEstimate(itemName: string): Promise<DraftIngredient> {
  const estimate = await services.ai.estimateNutrition(itemName);
  return {
    nameAsLogged: itemName,
    quantity: null,
    unit: null,
    rawOrCooked: 'unspecified',
    resolvedDescription: 'AI estimate — not measured, use with caution',
    isApproximateConversion: false,
    isUserStated: false,
    isEstimated: true,
    needsClarification: false,
    fractionEaten: 1,
    foodItemId: null,
    caloriesKcal: estimate.caloriesKcal,
    proteinG: estimate.proteinG,
    carbsG: estimate.carbsG,
    fatG: estimate.fatG,
    fiberG: estimate.fiberG,
  };
}

/** Only ever called after the user has explicitly confirmed the draft shown on screen. */
export async function confirmAndSaveMeal(draft: MealDraft): Promise<number> {
  if (draft.ingredients.some((ing) => ing.needsClarification)) {
    throw new MealDraftError('Every ingredient must be resolved before saving.');
  }

  const recipeId = await findOrCreateRecipe(draft.name);

  const ingredientsInput: SaveMealIngredientInput[] = draft.ingredients.map((ing) => ({
    foodItemId: ing.foodItemId,
    nameAsLogged: ing.nameAsLogged,
    quantity: ing.quantity,
    unit: ing.unit,
    rawOrCooked: ing.rawOrCooked,
    caloriesKcal: ing.caloriesKcal,
    proteinG: ing.proteinG,
    carbsG: ing.carbsG,
    fatG: ing.fatG,
    fiberG: ing.fiberG,
  }));

  return saveMeal({
    mealDate: new Date().toISOString().slice(0, 10),
    mealType: draft.mealType,
    name: draft.name,
    sourceText: draft.sourceText,
    inputMethod: draft.inputMethod,
    recipeId,
    totalCalories: draft.totalCalories,
    totalProteinG: draft.totalProteinG,
    totalCarbsG: draft.totalCarbsG,
    totalFatG: draft.totalFatG,
    totalFiberG: draft.totalFiberG,
    ingredients: ingredientsInput,
  });
}
