import { PostgrestError } from '@supabase/supabase-js';

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

/** README `Posts System`: a post lives for 24 hours from its creation. */
const POST_TTL_MS = 24 * 60 * 60 * 1000;

/** Storage object names must end in a real extension; unknown types fall back to jpg. */
const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
};

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

/**
 * Storage failures carry no SQLSTATE, so they are reshaped into the
 * PostgREST error shape before they leave this module: every error then
 * reaches the UI through `describePostgrestError`, never as a raw message.
 * A failure with no status code (fetch never got an answer) keeps an empty
 * code, which lands on the mapper's connection branch.
 */
function asPostgrestError(error: {
  message: string;
  status?: number;
  statusCode?: string;
}): PostgrestError {
  return new PostgrestError({
    code: error.statusCode ?? (error.status !== undefined ? String(error.status) : ''),
    message: error.message,
    details: '',
    hint: '',
  });
}

export type CreatePostInput = {
  userId: string;
  /** Cropped image bytes ready for upload (decoded from the picker's base64). */
  imageBytes: Uint8Array;
  mimeType: string;
  /** Already trimmed by the caller; empty becomes null. */
  description: string | null;
};

/**
 * Best-effort undo of the deactivation that `createPost` performs before the
 * upload. Runs only when a later step failed: the caller must return the
 * ORIGINAL error, so a restore failure is only logged — the previous post
 * then stays hidden until the user publishes again.
 */
async function restorePreviousActive(userId: string, previousIds: string[]): Promise<void> {
  if (previousIds.length === 0) return;

  try {
    const { error } = await supabase
      .from('posts')
      .update({ is_active: true })
      .eq('user_id', userId)
      .in('id', previousIds);
    if (error) console.warn(`[posts] could not restore previous active post: ${error.message}`);
  } catch (cause) {
    console.warn(
      `[posts] could not restore previous active post: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
}

/**
 * Publishes a post in the README order: deactivate the previous active post →
 * upload the image at `{userId}/{timestamp}.{ext}` → insert the new row with
 * `expires_at = created_at + 24h` and `is_active = true`.
 *
 * The deactivation is not optional: the partial unique index
 * `posts_one_active_per_user` rejects an insert while an active row exists,
 * so it must stay before the insert. Because it also runs before the upload,
 * every failure after it puts the deactivated row back first — otherwise a
 * failed upload would silently hide the user's last post from every feed.
 * Known limitation: if the upload succeeded but the insert failed, the
 * uploaded object stays orphaned in storage (nothing references it, and no
 * cleanup job exists).
 * Expiration stays a query filter in `fetchFeed` — there is no background job.
 */
export async function createPost(
  input: CreatePostInput,
): Promise<{ error: PostgrestError | null }> {
  // `.select('id')` turns the deactivation into `UPDATE ... RETURNING id`, so
  // the statement stays atomic: an error means no row was touched, and the
  // returned ids are exactly the rows a later failure has to restore.
  const { data: deactivated, error: deactivateError } = await supabase
    .from('posts')
    .update({ is_active: false })
    .eq('user_id', input.userId)
    .eq('is_active', true)
    .select('id');
  if (deactivateError) return { error: deactivateError };

  const previousIds: string[] = (deactivated ?? []).map((row: { id: string }) => row.id);

  const extension = EXTENSION_BY_MIME[input.mimeType] ?? 'jpg';
  const createdAt = new Date();
  const path = `${input.userId}/${createdAt.getTime()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from('posts')
    .upload(path, input.imageBytes, { contentType: input.mimeType });
  if (uploadError) {
    await restorePreviousActive(input.userId, previousIds);
    return { error: asPostgrestError(uploadError) };
  }

  const { error: insertError } = await supabase.from('posts').insert({
    user_id: input.userId,
    image_url: path,
    description: input.description,
    created_at: createdAt.toISOString(),
    expires_at: new Date(createdAt.getTime() + POST_TTL_MS).toISOString(),
    is_active: true,
  });
  if (insertError) await restorePreviousActive(input.userId, previousIds);

  return { error: insertError };
}
