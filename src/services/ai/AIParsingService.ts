/**
 * Implemented by OpenAIDirectAdapter.ts (Phase 2). The logging pipeline only
 * ever depends on this interface, never on the OpenAI SDK directly —
 * routing calls through a backend later (or swapping providers again) means
 * changing the adapter, not src/logging/*.
 *
 * Mode A only in Phase 2: every ingredient must be explicit in the source
 * text. Nothing is inferred or filled in — that's Mode B, Phase 6.
 */

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'other';
export type RawOrCooked = 'raw' | 'cooked' | 'unspecified';
export type IngredientMode = 'measured' | 'stated';

export interface ParsedIngredient {
  name: string;
  /** "measured": quantity+unit to resolve via USDA. "stated": user already gave the calories/macros directly. */
  mode: IngredientMode;
  quantity: number | null;
  unit: string | null;
  rawOrCooked: RawOrCooked;
  statedCalories: number | null;
  statedProteinG: number | null;
  statedCarbsG: number | null;
  statedFatG: number | null;
  statedFiberG: number | null;
  /** 1 = ate all of it (the common case). Less than 1 only when the user explicitly said they didn't eat all of it. */
  fractionEaten: number;
}

export interface ParsedMeal {
  mealType: MealType;
  name: string;
  ingredients: ParsedIngredient[];
}

export interface ParseContext {
  /** ISO timestamp for when this message is being logged, so meal type can be inferred from time of day if not stated. */
  loggedAt: string;
}

export interface NutritionEstimate {
  caloriesKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

export interface AIParsingService {
  parseMeal(text: string, context: ParseContext): Promise<ParsedMeal>;
  /** Interprets a free-text answer to a clarification prompt for one specific ingredient (e.g. "150g" or "about 40 cal"). */
  parseClarification(itemName: string, answerText: string): Promise<ParsedIngredient>;
  /** Only ever called when the user explicitly opts in ("I don't know, estimate it") — never on the system's own initiative. */
  estimateNutrition(itemName: string): Promise<NutritionEstimate>;
}
