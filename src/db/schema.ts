import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

/**
 * Phase 1 infrastructure table only — proves the SQLite connection and
 * migration pipeline work end-to-end. No domain tables (nutrition, workouts,
 * activity, weight) are introduced until the phase that needs them.
 */
export const appMeta = sqliteTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

/**
 * Phase 2 — nutrition core (Mode A only). Local cache of resolved nutrition
 * facts, keyed by USDA fdcId (source='usda') or created directly by the user
 * for foods USDA has no match for (source='custom', not used until that
 * fallback path exists).
 */
export const foodItems = sqliteTable('food_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  source: text('source', { enum: ['usda', 'custom'] }).notNull(),
  externalId: text('external_id'),
  description: text('description').notNull(),
  brand: text('brand'),
  dataType: text('data_type'),
  caloriesPer100g: real('calories_per_100g').notNull(),
  proteinPer100g: real('protein_per_100g').notNull(),
  carbsPer100g: real('carbs_per_100g').notNull(),
  fatPer100g: real('fat_per_100g').notNull(),
  fiberPer100g: real('fiber_per_100g').notNull().default(0),
  rawOrCooked: text('raw_or_cooked', { enum: ['raw', 'cooked', 'unspecified'] }).notNull(),
  lastFetchedAt: text('last_fetched_at').notNull(),
  /**
   * JSON array of normalized ingredient-name phrases (as typed by the user)
   * that have previously resolved to this food item — the actual cache key,
   * since a user's phrase ("chicken breast") rarely matches a USDA
   * `description` string exactly ("Chicken, broilers or fryers, breast,
   * meat only, cooked, roasted").
   */
  matchedQueries: text('matched_queries').notNull().default('[]'),
});

/**
 * A lightweight named container linking meals with the same name together —
 * find-or-create by normalized name only. No learning, merging, learned
 * defaults, or assumptions in Phase 2; that's the Phase 6 food_memory system.
 */
export const recipes = sqliteTable('recipes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  normalizedName: text('normalized_name').notNull().unique(),
  nameAliases: text('name_aliases').notNull().default('[]'),
  lastLoggedAt: text('last_logged_at').notNull(),
});

export const meals = sqliteTable('meals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  loggedAt: text('logged_at').notNull(),
  mealDate: text('meal_date').notNull(),
  mealType: text('meal_type', {
    enum: ['breakfast', 'lunch', 'dinner', 'snack', 'other'],
  }).notNull(),
  name: text('name').notNull(),
  inputMode: text('input_mode', { enum: ['A'] }).notNull(),
  sourceText: text('source_text').notNull(),
  inputMethod: text('input_method', { enum: ['typed', 'voice'] }).notNull(),
  recipeId: integer('recipe_id').references(() => recipes.id),
  totalCalories: real('total_calories').notNull(),
  totalProteinG: real('total_protein_g').notNull(),
  totalCarbsG: real('total_carbs_g').notNull(),
  totalFatG: real('total_fat_g').notNull(),
  totalFiberG: real('total_fiber_g').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const ingredients = sqliteTable('ingredients', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  mealId: integer('meal_id')
    .notNull()
    .references(() => meals.id, { onDelete: 'cascade' }),
  foodItemId: integer('food_item_id').references(() => foodItems.id),
  nameAsLogged: text('name_as_logged').notNull(),
  // Nullable: an ingredient the user reported via directly-stated nutrition
  // (e.g. "a coffee, about 130 cal") has no measurable amount to record.
  quantity: real('quantity'),
  unit: text('unit'),
  rawOrCooked: text('raw_or_cooked', { enum: ['raw', 'cooked', 'unspecified'] }).notNull(),
  caloriesKcal: real('calories_kcal').notNull(),
  proteinG: real('protein_g').notNull(),
  carbsG: real('carbs_g').notNull(),
  fatG: real('fat_g').notNull(),
  fiberG: real('fiber_g').notNull().default(0),
  createdAt: text('created_at').notNull(),
});
