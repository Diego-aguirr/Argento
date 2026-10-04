import type { PostgrestError } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase/client';

export type FeedProfile = {
  name: string | null;
  username: string | null;
  profile_image_url: string | null;
};

export type FeedPost = {
  id: string;
  userId: string;
  description: string | null;
  createdAt: string;
  expiresAt: string;
  imageUrl: string | null;
  avatarUrl: string | null;
  profile: FeedProfile | null;
};

/** One row as PostgREST returns it: snake_case columns and the embedded profile. */
type FeedRow = {
  id: string;
  user_id: string;
  image_url: string | null;
  description: string | null;
  created_at: string;
  expires_at: string;
  // Without generated DB types supabase-js types embeds as arrays; this join
  // is many-to-one, so PostgREST actually returns an object (or null).
  profiles: FeedProfile | FeedProfile[] | null;
};

const SIGNED_URL_TTL_SECONDS = 3600;

/**
 * The image columns store a storage PATH, so the feed needs a signed URL to
 * render it. A URL is used as-is, and a signing failure downgrades to null
 * instead of failing the row: one missing image must not hide the whole feed.
 */
async function resolveUrl(bucket: string, value: string | null): Promise<string | null> {
  if (!value) return null;
  if (value.startsWith('http')) return value;

  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(value, SIGNED_URL_TTL_SECONDS);
    return error ? null : (data?.signedUrl ?? null);
  } catch {
    return null;
  }
}

/**
 * Reads the feed: active posts that have not expired, newest first, joined
 * with the author's profile. Expiration is a query filter, not a job
 * (README), so expired rows are simply never returned.
 */
export async function fetchFeed(): Promise<{ posts: FeedPost[]; error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from('posts')
    .select(
      'id, user_id, image_url, description, created_at, expires_at, profiles:user_id(name, username, profile_image_url)',
    )
    .eq('is_active', true)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return { posts: [], error };

  const rows: FeedRow[] = data ?? [];

  const posts = await Promise.all(
    rows.map(async (row): Promise<FeedPost> => {
      const embedded = row.profiles;
      const profile = Array.isArray(embedded) ? (embedded[0] ?? null) : embedded;
      const [imageUrl, avatarUrl] = await Promise.all([
        resolveUrl('posts', row.image_url),
        resolveUrl('profiles', profile?.profile_image_url ?? null),
      ]);

      return {
        id: row.id,
        userId: row.user_id,
        description: row.description,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        imageUrl,
        avatarUrl,
        profile,
      };
    }),
  );

  return { posts, error: null };
}
