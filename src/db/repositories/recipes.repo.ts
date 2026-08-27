import { db } from '../client';
import { recipes } from '../schema';
import { eq } from 'drizzle-orm';

export function normalizeRecipeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Find-or-create by normalized name only. No learning, merging, or aliasing
 * logic here — this is a lightweight named container, not the food_memory
 * system (Phase 6).
 */
export async function findOrCreateRecipe(name: string): Promise<number> {
  const normalized = normalizeRecipeName(name);
  const now = new Date().toISOString();

  const existing = await db.select().from(recipes).where(eq(recipes.normalizedName, normalized)).limit(1);
  if (existing[0]) {
    await db.update(recipes).set({ lastLoggedAt: now }).where(eq(recipes.id, existing[0].id));
    return existing[0].id;
  }

  const [created] = await db
    .insert(recipes)
    .values({ name, normalizedName: normalized, nameAliases: '[]', lastLoggedAt: now })
    .returning();
  return created.id;
}
