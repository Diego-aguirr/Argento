import * as ImagePicker from 'expo-image-picker';

import type { PresentedError } from '@/lib/auth-errors';
import { base64ToBytes } from '@/lib/base64';

export type ImagePickSource = 'camera' | 'library';

export type PickedImage = {
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

const PERMISSION_ERRORS: Record<ImagePickSource, PresentedError> = {
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

async function readImageBytes(asset: ImagePicker.ImagePickerAsset): Promise<Uint8Array | null> {
  if (asset.base64) return base64ToBytes(asset.base64);
  // Web can hand back a File object instead of a base64 string.
  if (asset.file) return new Uint8Array(await asset.file.arrayBuffer());
  return null;
}

/**
 * Permission request → 1:1 crop → upload bytes. Shared by every flow that
 * needs a cropped photo (create post, profile image).
 *
 * Returns the picked photo, a `PresentedError` for a handled failure, or
 * `null` when the user cancels. Never surfaces raw picker messages: callers
 * distinguish the branches with `'title' in result`.
 */
export async function pickCroppedImage(
  source: ImagePickSource,
): Promise<PickedImage | PresentedError | null> {
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

    return { uri: asset.uri, bytes, mimeType: asset.mimeType ?? 'image/jpeg' };
  } catch (cause) {
    // Picker failures are plain Errors, not Supabase ones: log for the
    // developer and keep the stable copy for the user.
    if (__DEV__) {
      console.warn(`[picker] ${cause instanceof Error ? cause.message : String(cause)}`);
    }
    return PICKER_FAILED;
  }
}
