import type { PostgrestError } from '@supabase/supabase-js';

import type { PresentedError } from '@/lib/auth-errors';

/** fetch() never reached Postgrest: offline, DNS failure, or the host is down. */
const CONNECTION: PresentedError = {
  title: 'Connection problem',
  message: 'Check your connection and try again.',
};

/** Supabase answered, but with a code we do not map yet. Never expose raw messages. */
const GENERIC: PresentedError = {
  title: 'Something went wrong',
  message: 'Please try again.',
};

const MISCONFIGURED: PresentedError = {
  title: 'Unavailable right now',
  message: 'Something is misconfigured on the server. Try again later.',
};

const NOT_ALLOWED: PresentedError = {
  title: 'Not allowed',
  message: 'You do not have permission to save this.',
};

/** Postgres SQLSTATE unique_violation: shared by several constraints. */
const USERNAME_TAKEN: PresentedError = {
  title: 'Username taken',
  message: 'That username is already in use. Try another one.',
};

/**
 * Same SQLSTATE (23505), but raised by the partial unique index that enforces
 * one active post per user. Postgres puts the constraint name in the message,
 * which is how the two failures are told apart. Reachable when two devices
 * post for the same account between the deactivation and the insert (T11).
 */
const ACTIVE_POST_CONFLICT: PresentedError = {
  title: 'Post not published',
  message: 'Your previous post is still active. Try posting again.',
};

/**
 * Codes reachable from this app's flows: onboarding (profile read/write),
 * the queries that read it, and post creation (storage uploads answer 403
 * when the owner-folder policy refuses a write). Everything else falls
 * through to GENERIC.
 */
const BY_CODE: Record<string, PresentedError> = {
  '23505': USERNAME_TAKEN,
  '23503': {
    title: 'Profile not found',
    message: 'Your account record is missing. Sign out and sign in again.',
  },
  '42501': NOT_ALLOWED,
  '403': NOT_ALLOWED,
  PGRST116: {
    title: 'Nothing saved',
    message: 'The change was not applied. Please try again.',
  },
  PGRST202: MISCONFIGURED,
  '42P01': MISCONFIGURED,
};

/** Markers postgrest-js uses when the request never produced an HTTP answer. */
const TRANSPORT_MARKERS = ['Network request failed', 'FetchError'];

function isTransportFailure(error: PostgrestError): boolean {
  if (!error.code) return true;

  return TRANSPORT_MARKERS.some((marker) => error.message.includes(marker));
}

/**
 * Turns a Postgrest failure into copy a human can act on.
 *
 * Returns null when there is no error, so callers can write a single line:
 *
 *     const presented = describePostgrestError(error);
 *     if (presented) Alert.alert(presented.title, presented.message);
 */
export function describePostgrestError(
  error: PostgrestError | null | undefined,
): PresentedError | null {
  if (!error) return null;

  if (isTransportFailure(error)) return CONNECTION;

  // 23505 is shared: the constraint name in the message tells a username
  // collision from the one-active-post index violation apart.
  const mapped =
    error.code === '23505' && error.message.includes('posts_one_active_per_user')
      ? ACTIVE_POST_CONFLICT
      : BY_CODE[error.code];
  if (mapped) return mapped;

  // Unmapped code: keep the raw detail for the developer, never for the user.
  if (__DEV__) {
    console.warn(`[db] ${error.code || 'unknown'}: ${error.message}`);
  }

  return GENERIC;
}
