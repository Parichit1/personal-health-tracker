import type { FoodDetails, FoodSearchResult, NutritionDataSource } from './NutritionDataSource';
import {
  extractMacrosPer100g,
  getFoodDetail,
  pickBestMatch,
  searchFoods,
  type UsdaFoodDetail,
} from '../../nutrition/usdaClient';

function toFoodDetails(detail: UsdaFoodDetail): FoodDetails {
  const macros = extractMacrosPer100g(detail);
  return {
    externalId: String(detail.fdcId),
    description: detail.description,
    dataType: detail.dataType,
    caloriesPer100g: macros.caloriesPer100g,
    proteinPer100g: macros.proteinPer100g,
    carbsPer100g: macros.carbsPer100g,
    fatPer100g: macros.fatPer100g,
    fiberPer100g: macros.fiberPer100g,
    portions: (detail.foodPortions ?? [])
      .filter((p) => p.amount > 0)
      .map((p) => ({
        unitLabel: (p.modifier ?? p.portionDescription ?? '').trim(),
        gramWeight: p.gramWeight / p.amount,
      }))
      .filter((p) => p.unitLabel.length > 0),
  };
}

export class UsdaFdcAdapter implements NutritionDataSource {
  constructor(private readonly apiKey: string) {}

  async searchFood(query: string): Promise<FoodSearchResult[]> {
    const results = await searchFoods(query, this.apiKey);
    return results.map((r) => ({
      externalId: String(r.fdcId),
      description: r.description,
      dataType: r.dataType,
    }));
  }

  async getFoodDetails(externalId: string): Promise<FoodDetails> {
    const detail = await getFoodDetail(Number(externalId), this.apiKey);
    return toFoodDetails(detail);
  }

  async resolveBestMatch(query: string): Promise<FoodDetails | null> {
    const results = await searchFoods(query, this.apiKey);
    const best = pickBestMatch(results);
    if (!best) return null;
    const detail = await getFoodDetail(best.fdcId, this.apiKey);
    return toFoodDetails(detail);
  }
}
