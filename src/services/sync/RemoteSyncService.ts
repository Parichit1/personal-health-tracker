/**
 * Interface only — no implementation until Phase 8 (GoogleSheetsAdapter),
 * which is also the point a backend proxy is introduced to hold the
 * Google service-account credentials.
 */

export interface SyncableRecord {
  table: string;
  id: number | string;
  data: Record<string, unknown>;
}

export interface RemoteSyncService {
  enqueue(record: SyncableRecord): Promise<void>;
  flush(): Promise<void>;
}
