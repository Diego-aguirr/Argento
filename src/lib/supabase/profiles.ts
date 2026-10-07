import type { PostgrestError } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase/client';
import { EXTENSION_BY_MIME, uploadImage } from '@/lib/supabase/storage';

export type Profile = {
  id: string;
  name: string | null;
  username: string | null;
  profile_image_url: string | null;
  onboarding_completed: boolean;
};

/**
 * Reads the profile row for a user. maybeSingle() keeps a missing row a
 * non-event: profile is null and error stays null, so callers can treat
 * "no row yet" as "needs onboarding" instead of a failure.
 */
export async function fetchProfile(
  userId: string,
): Promise<{ profile: Profile | null; error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from('profiles')
    .select()
    .eq('id', userId)
    .maybeSingle();

  return { profile: data ?? null, error };
}

/**
 * Uploads the avatar to bucket `profiles` at the README path convention
 * `{userId}/profile.{ext}`. The path is FIXED per user, so a re-upload
 * overwrites the previous object (`upsert`) instead of accumulating orphans
 * at new timestamps. The returned path is what goes into
 * `profiles.profile_image_url`.
 */
export async function uploadProfileImage(
  userId: string,
  bytes: Uint8Array,
  mimeType: string,
): Promise<{ path: string | null; error: PostgrestError | null }> {
  const extension = EXTENSION_BY_MIME[mimeType] ?? 'jpg';
  const path = `${userId}/profile.${extension}`;

  const { error } = await uploadImage('profiles', path, bytes, mimeType, { upsert: true });

  return { path: error ? null : path, error };
}

/**
 * Stores the onboarding details and marks the profile as complete. The
 * upsert targets the primary key so it works whether the signup trigger
 * already created the row or not.
 *
 * `profileImageUrl` is OPTIONAL and only written when provided (even as
 * null): continuing without a photo must not null out an avatar that is
 * already stored on the row.
 */
export async function saveProfile(
  userId: string,
  input: { name: string; username: string; profileImageUrl?: string | null },
): Promise<{ profile: Profile | null; error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from('profiles')
    .upsert(
      {
        id: userId,
        name: input.name,
        username: input.username,
        ...(input.profileImageUrl !== undefined
          ? { profile_image_url: input.profileImageUrl }
          : {}),
        onboarding_completed: true,
      },
      { onConflict: 'id' },
    )
    .select()
    .single();

  return { profile: data ?? null, error };
}
