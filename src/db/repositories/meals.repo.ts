import { db } from '../client';
import { meals, ingredients } from '../schema';
import { eq } from 'drizzle-orm';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'other';
export type RawOrCooked = 'raw' | 'cooked' | 'unspecified';

export interface SaveMealIngredientInput {
  foodItemId: number | null;
  nameAsLogged: string;
  /** null for user-stated ingredients (no measurable amount, e.g. "a coffee, 130 cal"). */
  quantity: number | null;
  unit: string | null;
  rawOrCooked: RawOrCooked;
  caloriesKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

export interface SaveMealInput {
  mealDate: string;
  mealType: MealType;
  name: string;
  sourceText: string;
  inputMethod: 'typed' | 'voice';
  recipeId: number;
  totalCalories: number;
  totalProteinG: number;
  totalCarbsG: number;
  totalFatG: number;
  totalFiberG: number;
  ingredients: SaveMealIngredientInput[];
}

/**
 * Persists a meal and its ingredients as a sequence of inserts (not wrapped
 * in db.transaction() — the expo-sqlite Drizzle driver is 'sync'-mode, whose
 * transaction callback must return synchronously, which doesn't mix safely
 * with async/await; sequential awaited inserts is the safer choice for a
 * single-user app with no concurrent writers). Only ever called after the
 * user has explicitly confirmed a fully-resolved draft — see
 * src/logging/logMealPipeline.ts.
 */
export async function saveMeal(input: SaveMealInput): Promise<number> {
  const now = new Date().toISOString();

  const [meal] = await db
    .insert(meals)
    .values({
      loggedAt: now,
      mealDate: input.mealDate,
      mealType: input.mealType,
      name: input.name,
      inputMode: 'A',
      sourceText: input.sourceText,
      inputMethod: input.inputMethod,
      recipeId: input.recipeId,
      totalCalories: input.totalCalories,
      totalProteinG: input.totalProteinG,
      totalCarbsG: input.totalCarbsG,
      totalFatG: input.totalFatG,
      totalFiberG: input.totalFiberG,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  for (const ing of input.ingredients) {
    await db.insert(ingredients).values({
      mealId: meal.id,
      foodItemId: ing.foodItemId,
      nameAsLogged: ing.nameAsLogged,
      quantity: ing.quantity,
      unit: ing.unit,
      rawOrCooked: ing.rawOrCooked,
      caloriesKcal: ing.caloriesKcal,
      proteinG: ing.proteinG,
      carbsG: ing.carbsG,
      fatG: ing.fatG,
      fiberG: ing.fiberG,
      createdAt: now,
    });
  }

  return meal.id;
}

export async function getMealsForDate(mealDate: string) {
  return db.select().from(meals).where(eq(meals.mealDate, mealDate));
}
