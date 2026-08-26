import type { AIParsingService } from './ai/AIParsingService';
import type { NutritionDataSource } from './nutrition/NutritionDataSource';
import type { ActivityDataSource } from './activity/ActivityDataSource';
import type { RemoteSyncService } from './sync/RemoteSyncService';

/**
 * Composition root: the one place that decides which concrete adapter backs
 * each service interface. Phase 1 has no adapters — each is wired up
 * starting the phase that needs it (Phase 2: ai/nutrition, Phase 4b:
 * activity, Phase 8: sync). Swapping an adapter later (e.g. routing AI
 * calls through a backend proxy) means changing only this file.
 */
export const services: {
  ai: AIParsingService | null;
  nutrition: NutritionDataSource | null;
  activity: ActivityDataSource | null;
  sync: RemoteSyncService | null;
} = {
  ai: null,
  nutrition: null,
  activity: null,
  sync: null,
};
