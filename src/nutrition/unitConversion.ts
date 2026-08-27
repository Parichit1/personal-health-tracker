/**
 * Converts a stated quantity+unit to grams for universal units where the
 * conversion doesn't depend on which food it is. Approximate for volume
 * units (tbsp/tsp/cup/ml) since density varies by food — flagged as such
 * wherever these are surfaced to the user.
 *
 * Returns null for food-dependent units (piece, slice, clove, medium, etc.)
 * — the resolver must look those up via USDA's per-food `foodPortions`
 * instead, and fail cleanly (never guess) if that food has no matching
 * portion.
 */

const GRAMS_PER_UNIT: Record<string, number> = {
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  kilogram: 1000,
  kilograms: 1000,
  mg: 0.001,
  milligram: 0.001,
  milligrams: 0.001,
  oz: 28.3495,
  ounce: 28.3495,
  ounces: 28.3495,
  lb: 453.592,
  lbs: 453.592,
  pound: 453.592,
  pounds: 453.592,
  // Volume units — approximate 1 ml ≈ 1 g (water-like density); flagged as
  // approximate to the caller.
  ml: 1,
  milliliter: 1,
  milliliters: 1,
  l: 1000,
  liter: 1000,
  liters: 1000,
  tbsp: 15,
  tbs: 15,
  tbl: 15,
  tblsp: 15,
  tablespoon: 15,
  tablespoons: 15,
  tsp: 5,
  tspn: 5,
  teaspoon: 5,
  teaspoons: 5,
  cup: 240,
  cups: 240,
};

const APPROXIMATE_UNITS = new Set([
  'ml',
  'milliliter',
  'milliliters',
  'l',
  'liter',
  'liters',
  'tbsp',
  'tbs',
  'tbl',
  'tblsp',
  'tablespoon',
  'tablespoons',
  'tsp',
  'tspn',
  'teaspoon',
  'teaspoons',
  'cup',
  'cups',
]);

/**
 * Lowercases, trims, and strips a single trailing period (so "Tbs.", "oz.",
 * "lbs." match the same table entries as their unpunctuated forms) without
 * needing every abbreviation duplicated with and without a period.
 */
export function normalizeUnit(unit: string): string {
  return unit.trim().toLowerCase().replace(/\.$/, '');
}

export interface GramConversionResult {
  grams: number;
  isApproximate: boolean;
}

export function convertToGrams(quantity: number, unit: string): GramConversionResult | null {
  const normalized = normalizeUnit(unit);
  const factor = GRAMS_PER_UNIT[normalized];
  if (factor == null) return null;
  return { grams: quantity * factor, isApproximate: APPROXIMATE_UNITS.has(normalized) };
}
