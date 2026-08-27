import { z } from 'zod';

/**
 * Mode A extraction schema — every ingredient must be explicitly stated in
 * the source text; nothing is inferred or added (enforced by the prompt in
 * OpenAIDirectAdapter, not by this schema).
 *
 * Each ingredient is one of two modes:
 * - "measured": a weighable/countable quantity (e.g. "160g chicken breast")
 *   to be looked up in USDA FoodData Central.
 * - "stated": the user already gave the calories/macros directly instead of
 *   an amount (e.g. "a coffee, about 130 cal, 10g protein") — used as-is,
 *   never looked up.
 *
 * All fields are present (nullable rather than omitted) because OpenAI's
 * strict structured-output mode requires every property to be listed —
 * "optional" is represented as nullable, not absent.
 */
export const ParsedIngredientSchema = z.object({
  name: z.string().describe('Ingredient/item name as stated, normalized (e.g. "chicken breast", "coffee").'),
  mode: z
    .enum(['measured', 'stated'])
    .describe(
      '"measured" when the user gave a weighable/countable amount (grams, cups, pieces, tbsp, etc.) to look up. ' +
        '"stated" when the user directly gave calorie/macro numbers instead of an amount — use this whenever ' +
        'there is no measurable quantity to look up, even if a rough amount like "a coffee" is mentioned.',
    ),
  quantity: z
    .number()
    .nullable()
    .describe('Numeric amount exactly as stated. Required (non-null) when mode is "measured"; null when mode is "stated".'),
  unit: z
    .string()
    .nullable()
    .describe(
      'Unit exactly as stated (g, kg, ml, oz, lb, tbsp, tsp, cup, piece, slice, etc.), normalizing obvious ' +
        'shorthand. Required when mode is "measured"; null when mode is "stated".',
    ),
  rawOrCooked: z
    .enum(['raw', 'cooked', 'unspecified'])
    .describe('Only meaningful when mode is "measured"; use "unspecified" when mode is "stated".'),
  statedCalories: z
    .number()
    .nullable()
    .describe('The calorie value the user directly stated. Required (non-null) when mode is "stated"; null when mode is "measured".'),
  statedProteinG: z
    .number()
    .nullable()
    .describe('Protein in grams if the user stated it; null if not mentioned or mode is "measured".'),
  statedCarbsG: z
    .number()
    .nullable()
    .describe('Carbs in grams if the user stated it; null if not mentioned or mode is "measured".'),
  statedFatG: z
    .number()
    .nullable()
    .describe('Fat in grams if the user stated it; null if not mentioned or mode is "measured".'),
  statedFiberG: z
    .number()
    .nullable()
    .describe('Fiber in grams if the user stated it; null if not mentioned or mode is "measured".'),
  fractionEaten: z
    .number()
    .min(0)
    .max(1)
    .describe(
      'The fraction of this ingredient that was actually eaten. 1 (the common case) unless the user explicitly ' +
        'said they did not eat all of it. Disambiguation rule: if the "only ate part of it" phrase does NOT name a ' +
        'specific ingredient (e.g. "1 cup rice with 200g chicken, I only ate half of it" — "it" names nothing ' +
        'specific), apply the fraction to EVERY ingredient in the meal equally. Only apply it to a single ' +
        'ingredient when that ingredient is explicitly named in the fraction phrase itself (e.g. "200g rice with ' +
        '300g chicken breast, but only had half the chicken" -> chicken fractionEaten=0.5, rice fractionEaten=1). ' +
        'Never invent a fraction that was not implied by the text, and never default an unnamed fraction to just ' +
        'the most-recently-mentioned ingredient.',
    ),
});

export const MealParseSchema = z.object({
  mealType: z
    .enum(['breakfast', 'lunch', 'dinner', 'snack', 'other'])
    .describe('Infer from context or time of day if not stated; use "other" if genuinely unclear.'),
  name: z.string().describe('A short human-readable name for this meal, e.g. "Chicken and rice".'),
  ingredients: z
    .array(ParsedIngredientSchema)
    .min(1)
    .describe('Every ingredient/item explicitly mentioned — nothing inferred or added.'),
});

export type MealParseOutput = z.infer<typeof MealParseSchema>;
export type ParsedIngredientOutput = z.infer<typeof ParsedIngredientSchema>;

/**
 * Used when the user answers a clarification prompt for one specific
 * ingredient that couldn't be resolved (e.g. "150g" or "about 40 cal").
 * Same shape as one entry of MealParseSchema's ingredients array, since the
 * answer is exactly that — a quantity to look up, or stated nutrition.
 */
export const ClarificationAnswerSchema = ParsedIngredientSchema;
export type ClarificationAnswerOutput = z.infer<typeof ClarificationAnswerSchema>;

/**
 * Used only when the user explicitly asks for an AI estimate (they said
 * they don't know the amount/calories) — never invoked on the system's own
 * initiative. Always treated as an estimate, never as looked-up data.
 */
export const NutritionEstimateSchema = z.object({
  caloriesKcal: z.number().describe('A single reasonable typical estimate for this item, in kcal.'),
  proteinG: z.number().describe('Estimated protein in grams. 0 if negligible.'),
  carbsG: z.number().describe('Estimated carbs in grams. 0 if negligible.'),
  fatG: z.number().describe('Estimated fat in grams. 0 if negligible.'),
  fiberG: z.number().describe('Estimated fiber in grams. 0 if negligible.'),
});
export type NutritionEstimateOutput = z.infer<typeof NutritionEstimateSchema>;
