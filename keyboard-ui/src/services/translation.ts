import {apiClient} from './api';

export interface TranslationResult {
  text: string;
  sourceLocale: string;
  targetLocale: string;
}

export interface LanguageOption {
  language: string;
  name: string;
}

/**
 * Translates text for TranslationPanel. On-device ML Kit
 * translation would plug in here as the primary path (lower latency, works
 * offline); this currently always falls back to the backend proxy, which
 * calls DeepL. Swap the body for an ML Kit native module call when that's
 * wired up, keeping this same signature.
 *
 * sourceLocale is optional - omit it (or pass null) to let DeepL
 * auto-detect the source language, same as leaving it unset server-side.
 */
export async function translateText(
  text: string,
  targetLocale: string,
  sourceLocale?: string | null,
): Promise<TranslationResult> {
  const response = await apiClient.post<TranslationResult>('/api/translate', {
    text,
    targetLocale,
    sourceLocale: sourceLocale || undefined,
  });
  return response.data;
}

/**
 * The real, current list of languages DeepL supports - fetched rather
 * than hardcoded so it stays accurate as DeepL adds languages over time.
 * "source" and "target" are genuinely different lists (see
 * translate.controller.js's getLanguages), so callers need both.
 */
export async function getLanguages(type: 'source' | 'target'): Promise<LanguageOption[]> {
  const response = await apiClient.get<LanguageOption[]>('/api/translate/languages', {params: {type}});
  return response.data;
}
