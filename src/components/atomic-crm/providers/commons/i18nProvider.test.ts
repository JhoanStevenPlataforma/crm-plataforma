import { afterEach, describe, expect, it, vi } from "vitest";
import { getInitialLocale, i18nProvider } from "./i18nProvider";

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
