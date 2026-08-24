/**
 * Spanish messages for `ra-supabase`.
 *
 * Mirrors `ra-supabase-language-english` key for key. There is no
 * `ra-supabase-language-spanish` package to depend on, so this is the catalog.
 * The `password_reset` wording matches the override applied to English and
 * French in `i18nProvider.ts`.
 */
export const raSupabaseSpanishMessages = {
  "ra-supabase": {
    auth: {
      email: "Correo electrónico",
      confirm_password: "Confirma la contraseña",
      sign_in_with: "Iniciar sesión con %{provider}",
      forgot_password: "¿Has olvidado la contraseña?",
      reset_password: "Restablecer la contraseña",
      password_reset:
        "Revisa tu correo: te hemos enviado un mensaje para restablecer la contraseña.",
      missing_tokens: "Faltan los tokens de acceso y de actualización",
      back_to_login: "Volver al inicio de sesión",
    },
    reset_password: {
      forgot_password: "¿Has olvidado la contraseña?",
      forgot_password_details:
        "Introduce tu correo electrónico para recibir instrucciones.",
    },
    set_password: {
      new_password: "Elige tu contraseña",
    },
    validation: {
      password_mismatch: "Las contraseñas no coinciden",
    },
  },
};
