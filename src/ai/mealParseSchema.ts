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
const ParsedIngredientSchema = z.object({
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
