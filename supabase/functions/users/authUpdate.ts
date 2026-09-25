// Pure decision for what a profile edit may change on the auth user, kept out
// of index.ts so it can be unit-tested without the Deno runtime.

export interface AuthUserUpdateInput {
  isAdmin: boolean;
  email?: string;
  disabled?: boolean;
  firstName?: string;
  lastName?: string;
}

export interface AuthUserUpdate {
  email?: string;
  ban_duration?: string;
  user_metadata: { first_name?: string; last_name?: string };
}

/**
 * Build the attributes passed to `auth.admin.updateUserById`.
 *
 * The login email and the disabled (ban) state are administrator-only. On a
 * self-edit they are omitted on purpose (audit AUD-004): changing the login
 * email through the admin API takes effect with no confirmation, so allowing it
 * on a self-edit lets any user seize a login address without verifying it, and
 * disabling is not a profile edit. Name changes are always allowed.
 */
export function buildAuthUserUpdate(input: AuthUserUpdateInput): AuthUserUpdate {
  const update: AuthUserUpdate = {
    user_metadata: { first_name: input.firstName, last_name: input.lastName },
  };

  if (input.isAdmin) {
    update.email = input.email;
    update.ban_duration = input.disabled ? "87600h" : "none";
  }

  return update;
}
