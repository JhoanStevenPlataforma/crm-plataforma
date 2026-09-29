import englishMessages from "ra-language-english";
import { raSupabaseEnglishMessages } from "ra-supabase-language-english";
import { afterEach, describe, expect, it, vi } from "vitest";

import { englishCrmMessages } from "./englishCrmMessages";
import { getInitialLocale, i18nProvider } from "./i18nProvider";
import { spanishCrmMessages } from "./spanishCrmMessages";
import { spanishMessages } from "./spanishRaMessages";
import { raSupabaseSpanishMessages } from "./spanishSupabaseMessages";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("i18nProvider", () => {
  it("registers en, fr and es locales", () => {
    expect(i18nProvider.getLocales?.()).toEqual([
      { locale: "en", name: "English" },
      { locale: "fr", name: "Français" },
      { locale: "es", name: "Español" },
    ]);
  });

  it("keeps <html lang> on the language being shown", async () => {
    // M15 (QA audit): `lang` was fixed at "en", so a screen reader read the
    // Spanish interface with an English voice.
    await i18nProvider.changeLocale("es");
    expect(document.documentElement.lang).toBe("es");

    await i18nProvider.changeLocale("fr");
    expect(document.documentElement.lang).toBe("fr");
  });

  it("translates the language key in french", async () => {
    await i18nProvider.changeLocale("fr");

    expect(i18nProvider.translate("crm.language")).toBe("Langue");
  });

  it("translates the language key in spanish", async () => {
    await i18nProvider.changeLocale("es");

    expect(i18nProvider.translate("crm.language")).toBe("Idioma");
  });

  it("falls back to english for unknown locales", async () => {
    await i18nProvider.changeLocale("de");

    expect(i18nProvider.translate("crm.language")).toBe("Language");
  });

  it("uses customized password reset overrides for en and fr", async () => {
    await i18nProvider.changeLocale("en");
    expect(i18nProvider.translate("ra-supabase.auth.password_reset")).toBe(
      "Check your emails for a Reset Password message.",
    );

    await i18nProvider.changeLocale("fr");
    expect(i18nProvider.translate("ra-supabase.auth.password_reset")).toBe(
      "Consultez vos emails pour trouver le message de reinitialisation du mot de passe.",
    );
  });

  it("translates the ra-supabase auth messages in spanish", async () => {
    await i18nProvider.changeLocale("es");

    expect(i18nProvider.translate("ra-supabase.auth.password_reset")).toBe(
      "Revisa tu correo: te hemos enviado un mensaje para restablecer la contraseña.",
    );
    expect(i18nProvider.translate("ra-supabase.auth.forgot_password")).toBe(
      "¿Has olvidado la contraseña?",
    );
  });

  it("translates the react-admin core messages in spanish", async () => {
    await i18nProvider.changeLocale("es");

    expect(i18nProvider.translate("ra.action.save")).toBe("Guardar");
    expect(i18nProvider.translate("ra.auth.sign_in")).toBe("Iniciar sesión");
  });

  it("translates recently added fr crm keys", async () => {
    await i18nProvider.changeLocale("fr");

    expect(i18nProvider.translate("resources.deals.empty.title")).toBe(
      "Aucune affaire trouvée",
    );
  });

  it("translates crm keys in spanish", async () => {
    await i18nProvider.changeLocale("es");

    expect(i18nProvider.translate("resources.deals.empty.title")).toBe(
      "No se han encontrado oportunidades",
    );
    expect(i18nProvider.translate("resources.tasks.statuses.in_progress")).toBe(
      "En curso",
    );
  });

  it("pluralizes spanish messages", async () => {
    await i18nProvider.changeLocale("es");

    expect(
      i18nProvider.translate("crm.common.task_count", { smart_count: 1 }),
    ).toBe("1 tarea");
    expect(
      i18nProvider.translate("crm.common.task_count", { smart_count: 3 }),
    ).toBe("3 tareas");
  });

  it("uses browser french locale when available", () => {
    vi.stubGlobal("navigator", {
      language: "fr-FR",
      languages: ["fr-FR", "en-US"],
    });

    expect(getInitialLocale()).toBe("fr");
  });

  it("uses browser spanish locale when available", () => {
    vi.stubGlobal("navigator", {
      language: "es-ES",
      languages: ["es-ES", "en-US"],
    });

    expect(getInitialLocale()).toBe("es");
  });

  it("falls back to english when browser locale is unsupported", () => {
    vi.stubGlobal("navigator", {
      language: "de-DE",
      languages: ["de-DE", "pt-BR"],
    });

    expect(getInitialLocale()).toBe("en");
  });
});

/**
 * The Spanish catalogs are maintained by hand: English and French come from
 * `ra-language-*` / `ra-supabase-language-*` packages that update with
 * `npm update`, and there is no Spanish equivalent pinned here (adding one is a
 * supply-chain decision — see `.claude/rules/dependency-safety.md`).
 *
 * That asymmetry is the risk these tests exist for. When react-admin adds a
 * message, English and French get it for free and Spanish silently starts
 * rendering the raw key at the user. Comparing key paths turns that into a
 * failing test at upgrade time, which is the only moment anyone can act on it.
 */
describe("spanish catalog parity", () => {
  /** Every leaf path in a nested message catalog, as `a.b.c`. */
  const leafPaths = (value: unknown, prefix = ""): string[] => {
    if (typeof value !== "object" || value === null) {
      return prefix ? [prefix] : [];
    }
    return Object.entries(value as Record<string, unknown>).flatMap(
      ([key, child]) => leafPaths(child, prefix ? `${prefix}.${key}` : key),
    );
  };

  it("covers every ra-language-english key", () => {
    const english = new Set(leafPaths(englishMessages));
    const spanish = new Set(leafPaths(spanishMessages));

    const missing = [...english].filter((key) => !spanish.has(key));

    expect(missing).toEqual([]);
  });

  it("covers every ra-supabase-language-english key", () => {
    const english = new Set(leafPaths(raSupabaseEnglishMessages));
    const spanish = new Set(leafPaths(raSupabaseSpanishMessages));

    const missing = [...english].filter((key) => !spanish.has(key));

    expect(missing).toEqual([]);
  });

  it("covers every key of the CRM's own english catalog", () => {
    const english = new Set(leafPaths(englishCrmMessages));
    const spanish = new Set(leafPaths(spanishCrmMessages));

    expect([...english].filter((key) => !spanish.has(key))).toEqual([]);
    // Both ways here: these three catalogs are written together in this repo,
    // so a key only Spanish has is a typo rather than an upstream addition.
    expect([...spanish].filter((key) => !english.has(key))).toEqual([]);
  });

  it("speaks to the team as tú; only the customer's portal says usted", () => {
    // The portal addresses an outside customer, where "usted" is the business
    // register. Everything else is the team's own tool.
    const FORMAL =
      /\busted\b|\b(Pida|Escriba|Cópielo|Revise|Elija|Introduzca|Seleccione|Pulse)\b|envíelo/;
    const valueAt = (path: string) =>
      path
        .split(".")
        .reduce<unknown>(
          (node, key) => (node as Record<string, unknown>)[key],
          spanishCrmMessages,
        );

    const formal = leafPaths(spanishCrmMessages)
      .filter((path) => !path.startsWith("resources.quotes.portal."))
      .filter((path) => FORMAL.test(String(valueAt(path))));

    expect(formal).toEqual([]);
  });
});
