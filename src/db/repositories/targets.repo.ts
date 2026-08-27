import { getAppMetaValue, setAppMetaValue } from '../appMetaStore';

/**
 * Daily nutrition targets. Stored as plain app_meta key/value rows rather
 * than a dedicated table — this is a handful of numbers you set once and
 * occasionally adjust, not something with a history worth tracking, so a
 * new table would be unnecessary weight (app_meta already exists from
 * Phase 1 for exactly this kind of small global setting).
 */
export interface DailyTargets {
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
}

const TARGET_KEYS: Record<keyof DailyTargets, string> = {
  calories: 'target_calories',
  proteinG: 'target_protein_g',
  carbsG: 'target_carbs_g',
  fatG: 'target_fat_g',
  fiberG: 'target_fiber_g',
};

const TARGET_FIELDS = Object.keys(TARGET_KEYS) as (keyof DailyTargets)[];

export async function getDailyTargets(): Promise<DailyTargets> {
  const result = { calories: null, proteinG: null, carbsG: null, fatG: null, fiberG: null } as DailyTargets;
  await Promise.all(
    TARGET_FIELDS.map(async (field) => {
      const raw = await getAppMetaValue(TARGET_KEYS[field]);
      result[field] = raw != null && raw !== '' ? Number(raw) : null;
    }),
  );
  return result;
}

export async function setDailyTargets(targets: DailyTargets): Promise<void> {
  await Promise.all(
    TARGET_FIELDS.map((field) => {
      const value = targets[field];
      return setAppMetaValue(TARGET_KEYS[field], value == null ? '' : String(value));
    }),
  );
}
