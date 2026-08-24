import { mergeTranslations } from "ra-core";
import polyglotI18nProvider from "ra-i18n-polyglot";
import englishMessages from "ra-language-english";
import frenchMessages from "ra-language-french";
import { raSupabaseEnglishMessages } from "ra-supabase-language-english";
import { raSupabaseFrenchMessages } from "ra-supabase-language-french";
import { englishCrmMessages } from "./englishCrmMessages";
import { frenchCrmMessages } from "./frenchCrmMessages";
import { spanishCrmMessages } from "./spanishCrmMessages";
import { spanishMessages } from "./spanishRaMessages";
import { raSupabaseSpanishMessages } from "./spanishSupabaseMessages";

const SUPPORTED_LOCALES = ["en", "fr", "es"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

const raSupabaseEnglishMessagesOverride = {
  "ra-supabase": {
    auth: {
      password_reset: "Check your emails for a Reset Password message.",
    },
  },
};

const raSupabaseFrenchMessagesOverride = {
  "ra-supabase": {
    auth: {
      password_reset:
        "Consultez vos emails pour trouver le message de reinitialisation du mot de passe.",
    },
  },
};

const englishCatalog = mergeTranslations(
  englishMessages,
  raSupabaseEnglishMessages,
  raSupabaseEnglishMessagesOverride,
  englishCrmMessages,
);

const frenchCatalog = mergeTranslations(
  englishCatalog,
  frenchMessages,
  raSupabaseFrenchMessages,
  raSupabaseFrenchMessagesOverride,
  frenchCrmMessages,
);

// Layered over the English catalog like the French one, so any key the Spanish
// catalogs do not cover falls back to English instead of showing the raw key.
const spanishCatalog = mergeTranslations(
  englishCatalog,
  spanishMessages,
  raSupabaseSpanishMessages,
  spanishCrmMessages,
);

const catalogs: Record<SupportedLocale, typeof englishCatalog> = {
  en: englishCatalog,
  fr: frenchCatalog,
  es: spanishCatalog,
};

export const getInitialLocale = (): SupportedLocale => {
  if (typeof navigator === "undefined") {
    return "en";
  }

  const browserLocale = navigator.languages?.[0] ?? navigator.language;
  const language = browserLocale?.toLowerCase().split("-")[0];

  return SUPPORTED_LOCALES.includes(language as SupportedLocale)
    ? (language as SupportedLocale)
    : "en";
};

export const i18nProvider = polyglotI18nProvider(
  (locale) => catalogs[locale as SupportedLocale] ?? englishCatalog,
  getInitialLocale(),
  [
    { locale: "en", name: "English" },
    { locale: "fr", name: "Français" },
    { locale: "es", name: "Español" },
  ],
  { allowMissing: true },
);

export const testI18nProvider = polyglotI18nProvider(
  () => englishCatalog,
  "en",
  [{ locale: "en", name: "English" }],
  { allowMissing: true },
);
