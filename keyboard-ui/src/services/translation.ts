import {apiClient} from './api';

export interface TranslationResult {
  text: string;
  sourceLocale: string;
  targetLocale: string;
}

/**
 * Translates text for the inline TranslationBar. On-device ML Kit
 * translation would plug in here as the primary path (lower latency, works
 * offline); this currently always falls back to the backend proxy, which
 * calls DeepL. Swap the body for an ML Kit native module call when that's
 * wired up, keeping this same signature.
 */
export async function translateText(
  text: string,
  targetLocale: string,
): Promise<TranslationResult> {
  const response = await apiClient.post<TranslationResult>('/api/translate', {
    text,
    targetLocale,
  });
  return response.data;
}
