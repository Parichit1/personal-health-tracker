import { db } from '../client';
import { foodItems } from '../schema';
import { eq } from 'drizzle-orm';

export type FoodItemRow = typeof foodItems.$inferSelect;
export type NewFoodItem = typeof foodItems.$inferInsert;

/**
 * Cache lookup keyed on the normalized ingredient phrase the user actually
 * typed (e.g. "chicken breast"), not the USDA `description` string — those
 * rarely match verbatim. Scans all cached food_items in JS; fine at the
 * data volume a personal app accumulates.
 */
export async function findCachedByQuery(normalizedQuery: string): Promise<FoodItemRow | null> {
  const rows = await db.select().from(foodItems);
  for (const row of rows) {
    const queries: string[] = JSON.parse(row.matchedQueries || '[]');
    if (queries.includes(normalizedQuery)) return row;
  }
  return null;
}

export async function createFoodItem(data: NewFoodItem): Promise<FoodItemRow> {
  const [row] = await db.insert(foodItems).values(data).returning();
  return row;
}

export async function addMatchedQuery(foodItemId: number, normalizedQuery: string): Promise<void> {
  const [row] = await db.select().from(foodItems).where(eq(foodItems.id, foodItemId));
  if (!row) return;
  const queries: string[] = JSON.parse(row.matchedQueries || '[]');
  if (!queries.includes(normalizedQuery)) {
    queries.push(normalizedQuery);
    await db
      .update(foodItems)
      .set({ matchedQueries: JSON.stringify(queries) })
      .where(eq(foodItems.id, foodItemId));
  }
}
