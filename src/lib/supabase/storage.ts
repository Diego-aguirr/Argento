import { PostgrestError } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase/client';

/** Storage object names must end in a real extension; unknown types fall back to jpg. */
export const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
};

/**
 * Storage failures carry no SQLSTATE, so they are reshaped into the
 * PostgREST error shape before they leave the data layer: every error then
 * reaches the UI through `describePostgrestError`, never as a raw message.
 * A failure with no status code (fetch never got an answer) keeps an empty
 * code, which lands on the mapper's connection branch.
 */
export function asPostgrestError(error: {
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

export type UploadImageOptions = {
  /**
   * Replace an object that already exists at `path`. Without it storage-js
   * answers 409 "The resource already exists", so any fixed-path upload
   * (avatars) needs this to make re-uploads overwrite instead of fail.
   */
  upsert?: boolean;
};

/**
 * Shared storage upload for image bytes. Failures are mapped through
 * `asPostgrestError`, so callers only ever hand `describePostgrestError` a
 * PostgREST-shaped error.
 */
export async function uploadImage(
  bucket: string,
  path: string,
  bytes: Uint8Array,
  mimeType: string,
  options?: UploadImageOptions,
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, bytes, { contentType: mimeType, upsert: options?.upsert ?? false });

  return { error: error ? asPostgrestError(error) : null };
}
