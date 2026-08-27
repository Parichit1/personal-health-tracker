import type { FoodDetails, FoodSearchResult, NutritionDataSource } from './NutritionDataSource';
import {
  extractMacrosPer100g,
  getFoodDetail,
  rankByRelevance,
  scoreCandidate,
  searchFoods,
  searchFoodsTiered,
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

const QUALIFIER_FALLBACKS = ['cooked', 'raw'];

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

  /**
   * Tries the query as-is; walks its ranked candidates until one both has
   * real Energy data and a non-negative relevance score (no prepared-
   * product/blend penalty triggered). Returns null if nothing qualifies —
   * used by resolveBestMatch to decide whether to retry with a qualifier.
   */
  private async tryResolve(query: string): Promise<{ details: FoodDetails; score: number } | null> {
    const results = await searchFoodsTiered(query, this.apiKey);
    const ranked = rankByRelevance(results, query);

    for (const candidate of ranked) {
      const detail = await getFoodDetail(candidate.fdcId, this.apiKey);
      const foodDetails = toFoodDetails(detail);
      if (foodDetails.caloriesPer100g > 0) {
        return { details: foodDetails, score: scoreCandidate(candidate.description, query) };
      }
    }

    return null;
  }

  async resolveBestMatch(query: string): Promise<FoodDetails | null> {
    const primary = await this.tryResolve(query);
    if (primary && primary.score >= 0) return primary.details;

    // A bare/generic query (e.g. "rice" with no cooked/raw state given) can
    // rank badly against USDA's own search index — its top results can be
    // entirely snack/processed products (crackers, cakes) with no plain
    // match anywhere in the pool, even though the same query plus a cooked/
    // raw qualifier resolves correctly. Only retry if the query doesn't
    // already specify one (avoids infinite/redundant requerying).
    if (!/\b(cooked|raw)\b/i.test(query)) {
      for (const qualifier of QUALIFIER_FALLBACKS) {
        const attempt = await this.tryResolve(`${query} ${qualifier}`);
        if (attempt && attempt.score >= 0) return attempt.details;
      }
    }

    // Nothing clean found anywhere. A best-effort match that still tripped
    // a strong penalty (e.g. clearly a different product) is worse than
    // asking the user to clarify — only fall back to it if the signal was
    // mild.
    if (primary && primary.score > -100) return primary.details;
    return null;
  }
}
