import { openDatabaseSync } from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';

import * as schema from './schema';

export const expoDb = openDatabaseSync('personal-health-tracker.db', {
  enableChangeListener: false,
});

export const db = drizzle(expoDb, { schema });
