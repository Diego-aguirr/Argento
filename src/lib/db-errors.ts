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

/**
 * Codes reachable from this app's flows: onboarding (profile read/write)
 * and the queries that read it. Everything else falls through to GENERIC.
 */
const BY_CODE: Record<string, PresentedError> = {
  '23505': {
    title: 'Username taken',
    message: 'That username is already in use. Try another one.',
  },
  '23503': {
    title: 'Profile not found',
    message: 'Your account record is missing. Sign out and sign in again.',
  },
  '42501': {
    title: 'Not allowed',
    message: 'You do not have permission to save this.',
  },
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

  const mapped = BY_CODE[error.code];
  if (mapped) return mapped;

  // Unmapped code: keep the raw detail for the developer, never for the user.
  if (__DEV__) {
    console.warn(`[db] ${error.code || 'unknown'}: ${error.message}`);
  }

  return GENERIC;
}
