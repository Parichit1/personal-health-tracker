/**
 * Implemented by UsdaFdcAdapter.ts (Phase 2). The logging pipeline only ever
 * depends on this interface, never on the USDA client directly — swapping
 * nutrition sources later (or routing through a backend) means writing a new
 * adapter, not touching src/logging/*.
 */

export interface FoodSearchResult {
  externalId: string;
  description: string;
  dataType: string;
}

export interface FoodPortion {
  /** The unit label as USDA describes it, e.g. "piece", "medium", "cup". */
  unitLabel: string;
  /** Grams per one unit of this portion. */
  gramWeight: number;
}

export interface FoodDetails extends FoodSearchResult {
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g: number;
  /** Food-specific household-unit conversions (e.g. "1 piece" = 118g for a banana). */
  portions: FoodPortion[];
}

export interface NutritionDataSource {
  searchFood(query: string): Promise<FoodSearchResult[]>;
  getFoodDetails(externalId: string): Promise<FoodDetails>;
  /** Convenience: search + rank + fetch detail for the best match, or null if nothing was found. */
  resolveBestMatch(query: string): Promise<FoodDetails | null>;
}
