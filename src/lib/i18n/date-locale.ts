import type { Locale } from "date-fns";
import { de, enUS, es, fr, ptBR, ru, zhCN } from "date-fns/locale";
import { useTranslation } from "react-i18next";

import { matchLocale, type LocaleCode } from ".";

const DATE_LOCALES: Record<LocaleCode, Locale> = {
  en: enUS,
  de,
  fr,
  es,
  "pt-BR": ptBR,
  ru,
  "zh-CN": zhCN,
};

/**
 * date-fns locale for the active UI language. Call from components so they
 * re-render when the language changes, then pass it to date-fns helpers:
 * `formatDistanceToNow(date, { addSuffix: true, locale })`.
 */
export function useDateLocale(): Locale {
  const { i18n } = useTranslation();
  return DATE_LOCALES[matchLocale(i18n.language)];
}
