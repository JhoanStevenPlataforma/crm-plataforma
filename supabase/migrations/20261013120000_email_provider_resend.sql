-- Resend as a second real mail provider (docs/proposals/outbound-email.md).
-- The provider itself is code (`functions/_shared/email/resend.ts`); the
-- database only has to allow its key.
alter table public.email_settings
    drop constraint email_settings_provider_key_check;

alter table public.email_settings
    add constraint email_settings_provider_key_check
    check (provider_key in ('mock', 'postmark', 'resend'));
