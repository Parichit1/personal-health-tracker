import type { AIParsingService } from './ai/AIParsingService';
import type { NutritionDataSource } from './nutrition/NutritionDataSource';
import type { ActivityDataSource } from './activity/ActivityDataSource';
import type { RemoteSyncService } from './sync/RemoteSyncService';
import { OpenAIDirectAdapter } from './ai/OpenAIDirectAdapter';
import { UsdaFdcAdapter } from './nutrition/UsdaFdcAdapter';

/**
 * Composition root: the one place that decides which concrete adapter backs
 * each service interface. Swapping an adapter later (e.g. routing AI calls
 * through a backend proxy, or switching providers again) means changing
 * only this file.
 */

const openaiApiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
const usdaApiKey = process.env.EXPO_PUBLIC_USDA_FDC_API_KEY;

if (!openaiApiKey) {
  throw new Error(
    'EXPO_PUBLIC_OPENAI_API_KEY is not set. Add it to a .env file at the project root (see .env.example) and restart the Expo dev server.',
  );
}
if (!usdaApiKey) {
  throw new Error(
    'EXPO_PUBLIC_USDA_FDC_API_KEY is not set. Add it to a .env file at the project root (see .env.example) and restart the Expo dev server.',
  );
}

export const services: {
  ai: AIParsingService;
  nutrition: NutritionDataSource;
  activity: ActivityDataSource | null;
  sync: RemoteSyncService | null;
} = {
  ai: new OpenAIDirectAdapter(openaiApiKey),
  nutrition: new UsdaFdcAdapter(usdaApiKey),
  activity: null,
  sync: null,
};
