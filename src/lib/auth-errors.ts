import type { AuthError } from '@supabase/supabase-js';

export type PresentedError = {
  title: string;
  message: string;
};

/** Supabase answered, but with a code we do not map yet. Never expose raw messages. */
const GENERIC: PresentedError = {
  title: 'Something went wrong',
  message: 'Please try again. If it keeps happening, restart the app.',
};

/**
 * fetch() never reached Supabase: offline, DNS failure, or the host is down.
 * auth-js throws AuthRetryableFetchError with status 0 in that case
 * (packages/auth-js/src/lib/fetch.ts), which is what distinguishes it from a
 * real API rejection.
 */
const OFFLINE: PresentedError = {
  title: 'No connection',
  message: 'Check your internet connection and try again.',
};

/**
 * Codes reachable from this app's flows: sign in, sign up, sign out, and
 * session refresh. Everything else falls through to GENERIC.
 */
const BY_CODE: Record<string, PresentedError> = {
  invalid_credentials: {
    title: 'Sign in failed',
    message: 'Email or password is incorrect.',
  },
  email_not_confirmed: {
    title: 'Confirm your email',
    message: 'Open the link we sent you, then sign in again.',
  },
  user_already_exists: {
    title: 'Account already exists',
    message: 'Sign in instead, or use a different email.',
  },
  email_exists: {
    title: 'Account already exists',
    message: 'Sign in instead, or use a different email.',
  },
  weak_password: {
    title: 'Password too weak',
    message: 'Try a longer password with more characters.',
  },
  same_password: {
    title: 'Same password',
    message: 'Choose a password you have not used before.',
  },
  email_address_invalid: {
    title: 'Invalid email',
    message: 'Check the email address and try again.',
  },
  email_address_not_authorized: {
    title: 'Email not allowed',
    message: 'This email address cannot be used to sign up.',
  },
  over_email_send_rate_limit: {
    title: 'Too many attempts',
    message: 'Wait a minute before trying again.',
  },
  over_request_rate_limit: {
    title: 'Too many requests',
    message: 'Wait a moment and try again.',
  },
  validation_failed: {
    title: 'Check your details',
    message: 'Some of the information you entered is not valid.',
  },
  signup_disabled: {
    title: 'Sign ups are closed',
    message: 'This project is not accepting new accounts right now.',
  },
  email_provider_disabled: {
    title: 'Email sign in unavailable',
    message: 'Email sign in is turned off for this project.',
  },
  user_banned: {
    title: 'Account disabled',
    message: 'This account has been disabled.',
  },
  session_expired: {
    title: 'Session expired',
    message: 'Sign in again to continue.',
  },
  session_not_found: {
    title: 'Session expired',
    message: 'Sign in again to continue.',
  },
  refresh_token_not_found: {
    title: 'Session expired',
    message: 'Sign in again to continue.',
  },
  refresh_token_already_used: {
    title: 'Session expired',
    message: 'Sign in again to continue.',
  },
  request_timeout: {
    title: 'Request timed out',
    message: 'The server took too long to answer. Try again.',
  },
};

/**
 * Turns a Supabase auth failure into copy a human can act on.
 *
 * Returns null when there is no error, so callers can write a single line:
 *
 *     const presented = describeAuthError(error);
 *     if (presented) Alert.alert(presented.title, presented.message);
 */
export function describeAuthError(error: AuthError | null | undefined): PresentedError | null {
  if (!error) return null;

  if (error.status === 0) return OFFLINE;

  const mapped = error.code === undefined ? undefined : BY_CODE[error.code];
  if (mapped) return mapped;

  // Unmapped code: keep the raw detail for the developer, never for the user.
  if (__DEV__) {
    console.warn(`[auth] ${error.code ?? 'no-code'} (status ${error.status ?? '?'}): ${error.message}`);
  }

  return GENERIC;
}
