/**
 * Interface only — no implementation until Phase 2 (UsdaFdcAdapter).
 */

export interface FoodSearchResult {
  externalId: string;
  description: string;
  dataType: string;
}

export interface FoodDetails extends FoodSearchResult {
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
}

export interface NutritionDataSource {
  searchFood(query: string): Promise<FoodSearchResult[]>;
  getFoodDetails(externalId: string): Promise<FoodDetails>;
}
