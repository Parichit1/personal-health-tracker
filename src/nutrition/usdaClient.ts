/**
 * Thin wrapper over the USDA FoodData Central API. Raw fetch, not an SDK —
 * USDA has no official JS SDK, so plain HTTP is the correct choice here
 * (unlike the AI integration, which uses the official `openai` package).
 */

const BASE_URL = 'https://api.nal.usda.gov/fdc/v1';

const DATA_TYPE_PRIORITY: Record<string, number> = {
  Foundation: 0,
  'SR Legacy': 1,
  'Survey (FNDDS)': 2,
  Branded: 3,
};

export interface UsdaSearchResultItem {
  fdcId: number;
  description: string;
  dataType: string;
}

interface UsdaNutrientEntry {
  nutrient?: { id: number; name: string; unitName: string };
  amount?: number;
  nutrientName?: string;
  nutrientId?: number;
  value?: number;
  unitName?: string;
}

export interface UsdaFoodPortion {
  amount: number;
  modifier?: string;
  portionDescription?: string;
  gramWeight: number;
}

export interface UsdaFoodDetail {
  fdcId: number;
  description: string;
  dataType: string;
  foodNutrients: UsdaNutrientEntry[];
  foodPortions?: UsdaFoodPortion[];
}

export interface MacrosPer100g {
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g: number;
}

class UsdaApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'UsdaApiError';
  }
}

async function usdaFetch<T>(path: string, apiKey: string): Promise<T> {
  const separator = path.includes('?') ? '&' : '?';
  const url = `${BASE_URL}${path}${separator}api_key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new UsdaApiError(`USDA FDC request failed (${response.status}): ${body}`, response.status);
  }
  return (await response.json()) as T;
}

export async function searchFoods(query: string, apiKey: string): Promise<UsdaSearchResultItem[]> {
  const data = await usdaFetch<{ foods: UsdaSearchResultItem[] }>(
    `/foods/search?query=${encodeURIComponent(query)}&pageSize=10`,
    apiKey,
  );
  return data.foods ?? [];
}

export async function getFoodDetail(fdcId: number, apiKey: string): Promise<UsdaFoodDetail> {
  return usdaFetch<UsdaFoodDetail>(`/food/${fdcId}`, apiKey);
}

/** Prefers whole-food data types (Foundation/SR Legacy) over Branded, per the architecture's USDA recommendation. */
export function pickBestMatch(results: UsdaSearchResultItem[]): UsdaSearchResultItem | null {
  if (results.length === 0) return null;
  return [...results].sort((a, b) => {
    const pa = DATA_TYPE_PRIORITY[a.dataType] ?? 99;
    const pb = DATA_TYPE_PRIORITY[b.dataType] ?? 99;
    return pa - pb;
  })[0];
}

const NUTRIENT_NAME_PREFIXES: Record<keyof MacrosPer100g, string> = {
  caloriesPer100g: 'Energy',
  proteinPer100g: 'Protein',
  carbsPer100g: 'Carbohydrate, by difference',
  fatPer100g: 'Total lipid (fat)',
  fiberPer100g: 'Fiber, total dietary',
};

/**
 * USDA nutrient values are already expressed per 100g of the food. Not
 * every food reports fiber (e.g. most Branded items skip it) — defaults to
 * 0 rather than leaving it undefined, same convention as unstated macros
 * elsewhere in this app.
 */
export function extractMacrosPer100g(detail: UsdaFoodDetail): MacrosPer100g {
  const result: MacrosPer100g = {
    caloriesPer100g: 0,
    proteinPer100g: 0,
    carbsPer100g: 0,
    fatPer100g: 0,
    fiberPer100g: 0,
  };

  for (const entry of detail.foodNutrients) {
    const name = entry.nutrient?.name ?? entry.nutrientName;
    const amount = entry.amount ?? entry.value;
    if (!name || amount == null) continue;

    for (const key of Object.keys(NUTRIENT_NAME_PREFIXES) as (keyof MacrosPer100g)[]) {
      if (name.startsWith(NUTRIENT_NAME_PREFIXES[key])) {
        result[key] = amount;
      }
    }
  }

  return result;
}

/** Looks for a household-unit portion (e.g. "1 piece", "1 medium") matching the stated unit, for units convertToGrams() can't handle universally. */
export function findPortionGramWeight(detail: UsdaFoodDetail, unit: string): number | null {
  if (!detail.foodPortions) return null;
  const normalizedUnit = unit.trim().toLowerCase();
  const match = detail.foodPortions.find((p) => {
    const label = (p.modifier ?? p.portionDescription ?? '').toLowerCase();
    return label.includes(normalizedUnit);
  });
  return match ? match.gramWeight / match.amount : null;
}
