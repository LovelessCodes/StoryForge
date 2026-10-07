import i18next from "i18next";
import { initReactI18next } from "react-i18next";

import { resources } from "./locales";

/** Languages bundled with the app. `label` is always shown in that language. */
export const LOCALES = [
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
  { code: "pt-BR", label: "Português (Brasil)" },
  { code: "ru", label: "Русский" },
  { code: "zh-CN", label: "简体中文" },
] as const;

export type LocaleCode = (typeof LOCALES)[number]["code"];

/** Maps a BCP-47 tag to a bundled locale (`de-AT` → `de`, `pt-PT` → `pt-BR`). */
export function matchLocale(tag: string | null | undefined): LocaleCode {
  if (!tag) return "en";
  const normalized = tag.toLowerCase().replace("_", "-");
  const exact = LOCALES.find((locale) => locale.code.toLowerCase() === normalized);
  if (exact) return exact.code;
  const base = normalized.split("-")[0];
  return LOCALES.find((locale) => locale.code.toLowerCase().split("-")[0] === base)?.code ?? "en";
}

/**
 * Resolves the persisted preference ("system" or a locale code) against the
 * OS locale.
 */
export function resolveLocale(
  preference: string,
  systemLocale: string | null | undefined,
): LocaleCode {
  return preference === "system"
    ? matchLocale(systemLocale ?? navigator.language)
    : matchLocale(preference);
}

void i18next.use(initReactI18next).init({
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  resources: Object.fromEntries(
    Object.entries(resources).map(([language, tree]) => [language, { translation: tree }]),
  ),
});

i18next.on("languageChanged", (language) => {
  document.documentElement.lang = language;
});

export const i18n = i18next;

/**
 * Translate outside React (stores, mutation handlers, non-component helpers).
 * Evaluated when called, so it always uses the current language.
 */
export const t = (key: string, options?: Record<string, unknown>) => i18next.t(key, options);
