import type { PostgrestError } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase/client';

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
 * Stores the onboarding details and marks the profile as complete. The
 * upsert targets the primary key so it works whether the signup trigger
 * already created the row or not.
 */
export async function saveProfile(
  userId: string,
  input: { name: string; username: string },
): Promise<{ profile: Profile | null; error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from('profiles')
    .upsert(
      {
        id: userId,
        name: input.name,
        username: input.username,
        onboarding_completed: true,
      },
      { onConflict: 'id' },
    )
    .select()
    .single();

  return { profile: data ?? null, error };
}
