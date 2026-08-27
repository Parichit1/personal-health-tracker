/**
 * Thin wrapper over the USDA FoodData Central API. Raw fetch, not an SDK —
 * USDA has no official JS SDK, so plain HTTP is the correct choice here
 * (unlike the AI integration, which uses the official `openai` package).
 */

const BASE_URL = 'https://api.nal.usda.gov/fdc/v1';

/**
 * Searched in this order, stopping at the first tier that returns results —
 * this is what actually keeps matches relevant, not a client-side re-sort.
 * Restricting the *search itself* to whole-food data types means something
 * like a Branded "chicken tenders" product is never even a candidate for a
 * "chicken breast" query unless Foundation/SR Legacy/Survey genuinely have
 * nothing, at which point Branded is a reasonable last resort.
 */
const WHOLE_FOOD_TIERS: string[][] = [['Foundation', 'SR Legacy'], ['Survey (FNDDS)'], ['Branded']];

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

/** dataTypes, when given, restricts USDA's own search to just those data types (server-side, not a client-side filter). */
export async function searchFoods(
  query: string,
  apiKey: string,
  dataTypes?: string[],
): Promise<UsdaSearchResultItem[]> {
  const params = new URLSearchParams({ query, pageSize: '5' });
  if (dataTypes && dataTypes.length > 0) {
    params.set('dataType', dataTypes.join(','));
  }
  const data = await usdaFetch<{ foods: UsdaSearchResultItem[] }>(`/foods/search?${params.toString()}`, apiKey);
  return data.foods ?? [];
}

/**
 * Tries whole-food data types first, only widening to less-precise tiers
 * (and finally Branded) if the stricter tiers have no match at all. Keeps
 * Branded products (and processed things like "chicken tenders") out of
 * consideration entirely unless nothing better exists.
 */
export async function searchFoodsTiered(query: string, apiKey: string): Promise<UsdaSearchResultItem[]> {
  for (const tier of WHOLE_FOOD_TIERS) {
    const results = await searchFoods(query, apiKey, tier);
    if (results.length > 0) return results;
  }
  return [];
}

export async function getFoodDetail(fdcId: number, apiKey: string): Promise<UsdaFoodDetail> {
  return usdaFetch<UsdaFoodDetail>(`/food/${fdcId}`, apiKey);
}

/**
 * Words that indicate a different/prepared product than the plain
 * ingredient asked for (e.g. "chicken tenders" or "rice noodles" for a
 * "chicken breast"/"rice" query) — heavily penalized in ranking unless the
 * query itself mentions them. This list was built empirically by testing
 * real USDA responses for common ingredients, not guessed — even within
 * whole-food data types, USDA's own relevance ranking alone was not
 * reliable enough (e.g. "Lunchmeat, chicken breast, sliced" outranked plain
 * chicken breast; "Bagels, egg" outranked plain eggs).
 */
const PRODUCT_QUALIFIER_WORDS = new Set([
  'tenders', 'tender', 'nugget', 'nuggets', 'patty', 'patties', 'sausage', 'sausages',
  'lunchmeat', 'hotdog', 'deli', 'breaded', 'fried', 'noodles', 'noodle', 'roll', 'loaf',
  'sandwich', 'soup', 'pie', 'stick', 'sticks', 'wing', 'wings', 'drumstick',
  'drumsticks', 'cereal', 'cereals', 'pudding', 'juice', 'flour', 'starch', 'syrup', 'wild',
  'powder', 'canned', 'sauce', 'paste', 'puree', 'ring', 'rings', 'chip', 'chips', 'sweet',
  'bagel', 'bagels', 'bread', 'pancake', 'pancakes', 'waffle', 'waffles', 'cake', 'cakes',
  'muffin', 'muffins', 'biscuit', 'biscuits', 'cracker', 'crackers', 'pasta', 'pizza',
  'burrito', 'taco', 'custard', 'quiche', 'meringue', 'mayonnaise', 'mayo',
  // Deliberately NOT included: 'salad' — collides with "salad oil" (a
  // legitimate plain name for cooking oil), found via testing "olive oil".
]);

/**
 * A weaker signal than PRODUCT_QUALIFIER_WORDS: "and" reliably indicates a
 * description lists multiple distinct foods (a blend), e.g. "Oil, corn,
 * peanut, and olive" for a plain "olive oil" query. Deliberately excludes
 * "or", which commonly appears in legitimate single-food alternate naming
 * (e.g. "Chicken, broilers or fryers, breast...").
 */
const BLEND_INDICATOR_WORDS = new Set(['and']);

/** Naive English singularization — good enough for common food nouns (onion/onions, tomato/tomatoes, noodle/noodles). */
function singularize(word: string): string {
  if (word.endsWith('ies') && word.length > 4) return word.slice(0, -3) + 'y';
  if (/(x|s|z|ch|sh|o)es$/.test(word) && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('es') && word.length > 4) return word.slice(0, -1); // silent-e base + s, e.g. noodles -> noodle
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) return word.slice(0, -1);
  return word;
}

function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(singularize);
}

function relevanceScore(description: string, queryWords: Set<string>): { primary: number; wordCount: number } {
  const descWords = normalizeWords(description);
  const descSet = new Set(descWords);
  let matched = 0;
  for (const w of queryWords) if (descSet.has(w)) matched++;
  let penalty = 0;
  for (const w of descWords) {
    if (PRODUCT_QUALIFIER_WORDS.has(w) && !queryWords.has(w)) penalty += 100;
    if (BLEND_INDICATOR_WORDS.has(w) && !queryWords.has(w)) penalty += 50;
  }
  return { primary: matched * 10 - penalty, wordCount: descWords.length };
}

/**
 * Ranks by relevance to `query` (word overlap, penalizing prepared-product
 * qualifiers not mentioned in the query), tie-broken by shorter description
 * (plainer/simpler match, since compound/blended products tend to list more
 * words). Does NOT just trust USDA's own relevance order — even restricted
 * to whole-food data types, that alone let wrong matches win (see
 * PRODUCT_QUALIFIER_WORDS doc comment for concrete examples found in
 * testing). Returns the full ranked list — some USDA records (particularly
 * certain Foundation Foods for refined/processed staples like plain oils)
 * are missing Energy entirely, so the caller needs to be able to fall
 * through to the next-best candidate, not just take index 0 blindly.
 */
export function rankByRelevance(results: UsdaSearchResultItem[], query: string): UsdaSearchResultItem[] {
  const queryWords = new Set(normalizeWords(query));
  return [...results].sort((a, b) => {
    const sa = relevanceScore(a.description, queryWords);
    const sb = relevanceScore(b.description, queryWords);
    if (sb.primary !== sa.primary) return sb.primary - sa.primary;
    return sa.wordCount - sb.wordCount;
  });
}

export function pickBestMatch(results: UsdaSearchResultItem[], query: string): UsdaSearchResultItem | null {
  return rankByRelevance(results, query)[0] ?? null;
}

/**
 * Exposes just the relevance score (positive = clean match, negative =
 * triggered a prepared-product/blend penalty) for a specific description
 * against a specific query — used by callers that need to judge whether a
 * candidate is trustworthy, not just rank a fixed candidate pool.
 */
export function scoreCandidate(description: string, query: string): number {
  return relevanceScore(description, new Set(normalizeWords(query))).primary;
}

/**
 * Some fields have more than one acceptable USDA nutrient name — e.g.
 * certain Foundation Foods records report fat only as "Total fat (NLEA)"
 * (a food-label-rounded variant) rather than the usual "Total lipid (fat)",
 * with no "Total lipid (fat)" entry at all. Tried in order; first match
 * (by name+unit) wins, same as across entries.
 */
const NUTRIENT_SPECS: Record<keyof MacrosPer100g, { namePrefixes: string[]; unit: 'KCAL' | 'G' }> = {
  caloriesPer100g: { namePrefixes: ['Energy'], unit: 'KCAL' },
  proteinPer100g: { namePrefixes: ['Protein'], unit: 'G' },
  carbsPer100g: { namePrefixes: ['Carbohydrate, by difference'], unit: 'G' },
  fatPer100g: { namePrefixes: ['Total lipid (fat)', 'Total fat (NLEA)'], unit: 'G' },
  fiberPer100g: { namePrefixes: ['Fiber, total dietary'], unit: 'G' },
};

/**
 * USDA nutrient values are already expressed per 100g of the food. Not
 * every food reports fiber (e.g. most Branded items skip it) — defaults to
 * 0 rather than leaving it undefined, same convention as unstated macros
 * elsewhere in this app.
 *
 * Two USDA quirks this guards against:
 * 1. Many foods list "Energy" twice — once in KCAL, once in kJ (~4.18x
 *    larger) — and some list two different KCAL "Energy" variants
 *    (different calculation methods). Unit-checking plus first-match-wins
 *    (rather than last-match-wins) avoids silently using a kJ figure as if
 *    it were kcal, which was previously inflating calories by several times.
 * 2. Matching is by name prefix (data shapes differ slightly across
 *    Foundation/SR Legacy/Branded), so the unit check is the real guard
 *    against picking up an unrelated nutrient that happens to share a name
 *    prefix.
 */
export function extractMacrosPer100g(detail: UsdaFoodDetail): MacrosPer100g {
  const result: MacrosPer100g = {
    caloriesPer100g: 0,
    proteinPer100g: 0,
    carbsPer100g: 0,
    fatPer100g: 0,
    fiberPer100g: 0,
  };
  const found = new Set<keyof MacrosPer100g>();

  for (const entry of detail.foodNutrients) {
    const name = entry.nutrient?.name ?? entry.nutrientName;
    const amount = entry.amount ?? entry.value;
    const unit = (entry.nutrient?.unitName ?? entry.unitName ?? '').toUpperCase();
    if (!name || amount == null) continue;

    for (const key of Object.keys(NUTRIENT_SPECS) as (keyof MacrosPer100g)[]) {
      if (found.has(key)) continue; // first valid match wins
      const spec = NUTRIENT_SPECS[key];
      if (!spec.namePrefixes.some((prefix) => name.startsWith(prefix))) continue;
      if (unit !== spec.unit) continue;
      result[key] = amount;
      found.add(key);
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
