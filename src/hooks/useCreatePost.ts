import type { PostgrestError } from '@supabase/supabase-js';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import type { PresentedError } from '@/lib/auth-errors';
import { base64ToBytes } from '@/lib/base64';
import { describePostgrestError } from '@/lib/db-errors';
import { createPost } from '@/lib/supabase/posts';

export type PostImageSource = 'camera' | 'library';

export type DraftImage = {
  /** Local URI of the cropped photo — preview only; the upload uses `bytes`. */
  uri: string;
  bytes: Uint8Array;
  mimeType: string;
};

/**
 * One option set for both sources so every photo takes the same 1:1 crop path
 * (README "Creating a post"): `aspect` constrains the Android crop (iOS crops
 * square by itself), and `base64` is the upload payload — storage-js documents
 * typed-array bodies as the React Native input because Blob/FormData do not
 * work as intended there, and RN's XHR sends views as binary.
 * `allowsEditing` is native-only; on web the photo is used as picked.
 */
const PICK_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: true,
  aspect: [1, 1],
  base64: true,
};

const PERMISSION_ERRORS: Record<PostImageSource, PresentedError> = {
  camera: {
    title: 'Camera access needed',
    message: 'Allow camera access in Settings to take a photo.',
  },
  library: {
    title: 'Photo access needed',
    message: 'Allow photo access in Settings to choose a photo.',
  },
};

const UNREADABLE: PresentedError = {
  title: 'Photo not read',
  message: 'That photo could not be read. Please try another one.',
};

const PICKER_FAILED: PresentedError = {
  title: 'Could not open the picker',
  message: 'Something went wrong choosing a photo. Please try again.',
};

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

async function readImageBytes(asset: ImagePicker.ImagePickerAsset): Promise<Uint8Array | null> {
  if (asset.base64) return base64ToBytes(asset.base64);
  // Web can hand back a File object instead of a base64 string.
  if (asset.file) return new Uint8Array(await asset.file.arrayBuffer());
  return null;
}

/**
 * Owns the create-post draft: permission request → crop → preview bytes, then
 * the deactivate → upload → insert round-trip. Errors come back as
 * `PresentedError` (already mapped by `describePostgrestError` or app copy);
 * this hook never surfaces raw Supabase or picker messages.
 */
export function useCreatePost(): UseCreatePostResult {
  const { user } = useAuth();
  const [draft, setDraft] = useState<DraftImage | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const pickImage = async (source: PostImageSource): Promise<PresentedError | null> => {
    try {
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return PERMISSION_ERRORS[source];

      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(PICK_OPTIONS)
          : await ImagePicker.launchImageLibraryAsync(PICK_OPTIONS);
      if (result.canceled) return null;

      const asset = result.assets?.[0];
      if (!asset) return null;

      const bytes = await readImageBytes(asset);
      if (!bytes) return UNREADABLE;

      setDraft({ uri: asset.uri, bytes, mimeType: asset.mimeType ?? 'image/jpeg' });
      return null;
    } catch (cause) {
      // Picker failures are plain Errors, not Supabase ones: log for the
      // developer and keep the stable copy for the user.
      if (__DEV__) {
        console.warn(`[picker] ${cause instanceof Error ? cause.message : String(cause)}`);
      }
      return PICKER_FAILED;
    }
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
