import { services } from '../services';
import { convertToGrams, normalizeUnit } from '../nutrition/unitConversion';
import { findCachedByQuery, createFoodItem } from '../db/repositories/foodItems.repo';
import { findOrCreateRecipe } from '../db/repositories/recipes.repo';
import { saveMeal, type SaveMealIngredientInput } from '../db/repositories/meals.repo';
import type { MealType, ParsedIngredient, RawOrCooked } from '../services/ai/AIParsingService';
import type { FoodDetails } from '../services/nutrition/NutritionDataSource';

/**
 * Thrown whenever the AI call fails or an ingredient can't be resolved to
 * real nutrition data. Never caught to silently produce a partial draft —
 * the caller (the Log screen) must show the error and save nothing.
 */
export class MealDraftError extends Error {}

export interface DraftIngredient {
  nameAsLogged: string;
  /** null for "stated" ingredients — there's no measurable amount. */
  quantity: number | null;
  unit: string | null;
  rawOrCooked: RawOrCooked;
  resolvedDescription: string;
  isApproximateConversion: boolean;
  /** True when this ingredient's numbers came directly from the user, never looked up. */
  isUserStated: boolean;
  /** null for "stated" ingredients — nothing was resolved against food_items. */
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

function normalizeQuery(name: string): string {
  return name.trim().toLowerCase();
}

async function resolveFoodDetails(
  ingredientName: string,
): Promise<{ details: FoodDetails; foodItemId: number }> {
  const normalizedQuery = normalizeQuery(ingredientName);

  const cached = await findCachedByQuery(normalizedQuery);
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

  const resolved = await services.nutrition.resolveBestMatch(ingredientName);
  if (!resolved) {
    throw new MealDraftError(
      `Could not find nutrition data for "${ingredientName}" in USDA FoodData Central. Try a simpler or more common name.`,
    );
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
    rawOrCooked: 'unspecified',
    lastFetchedAt: new Date().toISOString(),
    matchedQueries: JSON.stringify([normalizedQuery]),
  });

  return { foodItemId: created.id, details: resolved };
}

/**
 * Resolves one parsed ingredient into a DraftIngredient. Ingredients are
 * independent of each other, so parseMealDraft runs these concurrently
 * (Promise.all) instead of one-at-a-time — a 4-ingredient meal previously
 * meant 4 sequential round-trips to USDA, which was most of the remaining
 * latency after the AI call itself got faster.
 */
async function resolveIngredient(ingredient: ParsedIngredient): Promise<DraftIngredient> {
  if (ingredient.mode === 'stated') {
    if (ingredient.statedCalories == null) {
      throw new MealDraftError(
        `"${ingredient.name}" was recognized as directly-stated nutrition, but no calorie value came through — try restating it with a calorie number.`,
      );
    }

    return {
      nameAsLogged: ingredient.name,
      quantity: null,
      unit: null,
      rawOrCooked: 'unspecified',
      resolvedDescription: 'as you stated (not looked up)',
      isApproximateConversion: false,
      isUserStated: true,
      foodItemId: null,
      caloriesKcal: ingredient.statedCalories,
      proteinG: ingredient.statedProteinG ?? 0,
      carbsG: ingredient.statedCarbsG ?? 0,
      fatG: ingredient.statedFatG ?? 0,
      fiberG: ingredient.statedFiberG ?? 0,
    };
  }

  if (ingredient.quantity == null || ingredient.unit == null) {
    throw new MealDraftError(`"${ingredient.name}" is missing a quantity or unit to look up.`);
  }
  const quantity = ingredient.quantity;
  const unit = ingredient.unit;

  const { details, foodItemId } = await resolveFoodDetails(ingredient.name);

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
      throw new MealDraftError(
        `Don't know how many grams a "${unit}" of "${ingredient.name}" is — try stating it in grams, ounces, or another standard unit instead.`,
      );
    }
    grams = portion.gramWeight * quantity;
    isApproximateConversion = true;
  }

  const factor = grams / 100;

  return {
    nameAsLogged: ingredient.name,
    quantity,
    unit,
    rawOrCooked: ingredient.rawOrCooked,
    resolvedDescription: details.description,
    isApproximateConversion,
    isUserStated: false,
    foodItemId,
    caloriesKcal: details.caloriesPer100g * factor,
    proteinG: details.proteinPer100g * factor,
    carbsG: details.carbsPer100g * factor,
    fatG: details.fatPer100g * factor,
    fiberG: details.fiberPer100g * factor,
  };
}

/**
 * Parse -> resolve -> compute. Writes nothing to the database. Throws
 * MealDraftError (or lets the AI call's own error propagate) if anything
 * can't be resolved — the caller must not persist a partial result.
 */
export async function parseMealDraft(
  sourceText: string,
  inputMethod: 'typed' | 'voice',
): Promise<MealDraft> {
  const loggedAt = new Date().toISOString();
  const parsed = await services.ai.parseMeal(sourceText, { loggedAt });

  // Ingredients don't depend on each other, so resolve them concurrently.
  const draftIngredients = await Promise.all(parsed.ingredients.map(resolveIngredient));

  let totalCalories = 0;
  let totalProteinG = 0;
  let totalCarbsG = 0;
  let totalFatG = 0;
  let totalFiberG = 0;
  for (const ing of draftIngredients) {
    totalCalories += ing.caloriesKcal;
    totalProteinG += ing.proteinG;
    totalCarbsG += ing.carbsG;
    totalFatG += ing.fatG;
    totalFiberG += ing.fiberG;
  }

  return {
    sourceText,
    inputMethod,
    mealType: parsed.mealType,
    name: parsed.name,
    ingredients: draftIngredients,
    totalCalories,
    totalProteinG,
    totalCarbsG,
    totalFatG,
    totalFiberG,
  };
}

/** Only ever called after the user has explicitly confirmed the draft shown on screen. */
export async function confirmAndSaveMeal(draft: MealDraft): Promise<number> {
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
