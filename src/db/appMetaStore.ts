import { eq } from 'drizzle-orm';

import { db } from './client';
import { appMeta } from './schema';

export async function getAppMetaValue(key: string): Promise<string | null> {
  const rows = await db.select().from(appMeta).where(eq(appMeta.key, key)).limit(1);
  return rows[0]?.value ?? null;
}

export async function setAppMetaValue(key: string, value: string): Promise<void> {
  await db
    .insert(appMeta)
    .values({ key, value })
    .onConflictDoUpdate({ target: appMeta.key, set: { value } });
}
