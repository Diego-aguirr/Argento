import type { PostgrestError } from '@supabase/supabase-js';
import { useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import type { PresentedError } from '@/lib/auth-errors';
import { describePostgrestError } from '@/lib/db-errors';
import { pickCroppedImage, type ImagePickSource, type PickedImage } from '@/lib/image-picker';
import { createPost } from '@/lib/supabase/posts';

/** Camera vs library picker source — alias kept for the create-post screen. */
export type PostImageSource = ImagePickSource;

/** Cropped photo waiting for review; the shape is owned by the picker helper. */
export type DraftImage = PickedImage;

const NOT_SIGNED_IN: PresentedError = {
  title: 'Not signed in',
  message: 'Sign in again to share a photo.',
};

export type UseCreatePostResult = {
  /** Cropped photo waiting for review, or null when no flow is open. */
  draft: DraftImage | null;
  /** True while an upload/insert round-trip runs. */
  submitting: boolean;
  pickImage: (source: PostImageSource) => Promise<PresentedError | null>;
  clearDraft: () => void;
  submit: (description: string) => Promise<PresentedError | null>;
};

/**
 * Owns the create-post draft: permission request → crop → preview bytes (via
 * `pickCroppedImage`), then the deactivate → upload → insert round-trip.
 * Errors come back as `PresentedError` (already mapped by
 * `describePostgrestError` or app copy); this hook never surfaces raw
 * Supabase or picker messages.
 */
export function useCreatePost(): UseCreatePostResult {
  const { user } = useAuth();
  const [draft, setDraft] = useState<DraftImage | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const pickImage = async (source: PostImageSource): Promise<PresentedError | null> => {
    const picked = await pickCroppedImage(source);
    if (!picked) return null;
    if ('title' in picked) return picked;

    setDraft(picked);
    return null;
  };

  const clearDraft = (): void => {
    setDraft(null);
  };

  const submit = async (description: string): Promise<PresentedError | null> => {
    if (submitting || !draft) return null;
    if (!user) return NOT_SIGNED_IN;

    setSubmitting(true);
    try {
      const trimmed = description.trim();
      const { error } = await createPost({
        userId: user.id,
        imageBytes: draft.bytes,
        mimeType: draft.mimeType,
        description: trimmed ? trimmed : null,
      });

      const presented = describePostgrestError(error);
      // Success closes the review modal; a failure keeps the draft so the
      // user can retry without re-picking the photo.
      if (!presented) setDraft(null);
      return presented;
    } catch (cause) {
      return describePostgrestError(cause as PostgrestError);
    } finally {
      setSubmitting(false);
    }
  };

  return { draft, submitting, pickImage, clearDraft, submit };
}
