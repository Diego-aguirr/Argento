import type { PostgrestError } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import { describeAuthError, type PresentedError } from '@/lib/auth-errors';
import { describePostgrestError } from '@/lib/db-errors';
import { pickCroppedImage, type ImagePickSource, type PickedImage } from '@/lib/image-picker';
import { supabase } from '@/lib/supabase/client';
import { saveProfile, uploadProfileImage, type Profile } from '@/lib/supabase/profiles';

const NOT_SIGNED_IN: PresentedError = {
  title: 'Not signed in',
  message: 'Sign in again to edit your profile.',
};

const MISSING_DETAILS: PresentedError = {
  title: 'Missing details',
  message: 'Enter a name and a username to save.',
};

const USERNAME_SPACES: PresentedError = {
  title: 'Check your details',
  message: 'Usernames cannot contain spaces.',
};

/**
 * Twin of an upload that answered without an error yet without a path
 * (storage-js should never do that): writing `null` into
 * `profile_image_url` would silently drop the avatar that is already there.
 */
const UPLOAD_FAILED: PresentedError = {
  title: 'Photo not uploaded',
  message: 'Your photo could not be uploaded. Please try again.',
};

/** Signed avatar URLs are short-lived; every mount re-signs the path. */
const SIGNED_URL_TTL_SECONDS = 3600;

export type UseProfileEditResult = {
  name: string;
  username: string;
  setName: (value: string) => void;
  setUsername: (value: string) => void;
  /** True when the trimmed drafts differ from the stored row. */
  changed: boolean;
  /** True while an avatar upload or a profile save runs. */
  saving: boolean;
  /** Picked draft photo, freshly uploaded avatar, or the signed storage URL. */
  avatarUri: string | null;
  /** Permission → crop → upload → store the path on the row. */
  pickAvatar: (source: ImagePickSource) => Promise<PresentedError | null>;
  /** Validates the drafts, uploads a pending photo if any, then saves. */
  save: () => Promise<PresentedError | null>;
  signOut: () => Promise<PresentedError | null>;
};

/**
 * Edit state for the profile screen (T12). The caller mounts this only once
 * the `profile` row exists, so the drafts initialize from props — no
 * set-state-in-effect reset is needed, and a remount (row arriving, user
 * switch) re-seeds them.
 *
 * `profiles.profile_image_url` stores a storage PATH, not an http URL: it is
 * signed here for display, exactly like the feed signs post images. Errors
 * always come back as `PresentedError` (mapped by `describePostgrestError` /
 * `describeAuthError`); this hook never surfaces raw backend messages.
 */
export function useProfileEdit(profile: Profile): UseProfileEditResult {
  const { user, refreshProfile, signOut: endSession } = useAuth();
  const [name, setName] = useState(profile.name ?? '');
  const [username, setUsername] = useState(profile.username ?? '');
  const [avatarDraft, setAvatarDraft] = useState<PickedImage | null>(null);
  const [uploadedAvatarUri, setUploadedAvatarUri] = useState<string | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const avatarPath = profile.profile_image_url;

  useEffect(() => {
    let cancelled = false;

    // Async on purpose: setState only ever runs in a continuation, never
    // synchronously in the effect body (react-hooks/set-state-in-effect).
    const resolve = async () => {
      if (!avatarPath || avatarPath.startsWith('http')) {
        if (!cancelled) setSignedUrl(avatarPath);
        return;
      }

      try {
        const { data, error } = await supabase.storage
          .from('profiles')
          .createSignedUrl(avatarPath, SIGNED_URL_TTL_SECONDS);
        if (cancelled) return;
        // A signing failure downgrades to the initial-letter placeholder: one
        // broken URL must not break the screen (same rule as the feed).
        setSignedUrl(error ? null : (data?.signedUrl ?? null));
      } catch {
        if (!cancelled) setSignedUrl(null);
      }
    };

    void resolve();

    return () => {
      cancelled = true;
    };
  }, [avatarPath]);

  const trimmedName = name.trim();
  const trimmedUsername = username.trim();
  const changed =
    trimmedName !== (profile.name ?? '') || trimmedUsername !== (profile.username ?? '');

  const uploadAvatar = async (
    userId: string,
    picked: PickedImage,
  ): Promise<{ path: string | null; presented: PresentedError | null }> => {
    const { path, error } = await uploadProfileImage(userId, picked.bytes, picked.mimeType);
    const presented = describePostgrestError(error) ?? (path === null ? UPLOAD_FAILED : null);
    return { path: presented ? null : path, presented };
  };

  /**
   * Avatar flow: upload → store the path alongside the row's EXISTING
   * name/username, so unsaved field edits keep waiting for the Save button
   * instead of being written behind the user's back. A failure keeps the
   * picked photo as a draft: it stays previewed and rides along with the
   * next save, so a retry never forces a re-pick.
   */
  const publishAvatar = async (picked: PickedImage): Promise<PresentedError | null> => {
    if (!user) return NOT_SIGNED_IN;

    const { path, presented } = await uploadAvatar(user.id, picked);
    if (presented || path === null) return presented ?? UPLOAD_FAILED;

    const { error } = await saveProfile(user.id, {
      name: profile.name ?? '',
      username: profile.username ?? '',
      profileImageUrl: path,
    });

    const saved = describePostgrestError(error);
    if (saved) return saved; // keep the draft for a retry

    setAvatarDraft(null);
    setUploadedAvatarUri(picked.uri);
    await refreshProfile();
    return null;
  };

  const pickAvatar = async (source: ImagePickSource): Promise<PresentedError | null> => {
    if (saving) return null;

    const picked = await pickCroppedImage(source);
    if (!picked) return null; // user canceled the picker
    if ('title' in picked) return picked;

    setAvatarDraft(picked);
    setSaving(true);
    try {
      return await publishAvatar(picked);
    } catch (cause) {
      return describePostgrestError(cause as PostgrestError);
    } finally {
      setSaving(false);
    }
  };

  const save = async (): Promise<PresentedError | null> => {
    if (saving) return null;
    if (!user) return NOT_SIGNED_IN;

    if (!trimmedName || !trimmedUsername) return MISSING_DETAILS;
    if (trimmedUsername.includes(' ')) return USERNAME_SPACES;

    setSaving(true);
    try {
      let profileImageUrl: string | undefined;
      if (avatarDraft) {
        // Photo left over from a failed avatar flow rides along here.
        const { path, presented } = await uploadAvatar(user.id, avatarDraft);
        if (presented || path === null) return presented ?? UPLOAD_FAILED;
        profileImageUrl = path;
      }

      const { error } = await saveProfile(user.id, {
        name: trimmedName,
        username: trimmedUsername,
        // Omitted when no photo is pending, so saving the fields never
        // nulls out an avatar that already exists on the row.
        ...(profileImageUrl !== undefined ? { profileImageUrl } : {}),
      });

      const presented = describePostgrestError(error);
      if (presented) return presented; // keep the drafts for a retry

      if (avatarDraft) {
        setUploadedAvatarUri(avatarDraft.uri);
        setAvatarDraft(null);
      }
      // Normalize the drafts to what was stored (trim), then reload the row
      // so every reader — including `changed` — compares against reality.
      setName(trimmedName);
      setUsername(trimmedUsername);
      await refreshProfile();
      return null;
    } catch (cause) {
      return describePostgrestError(cause as PostgrestError);
    } finally {
      setSaving(false);
    }
  };

  const signOut = async (): Promise<PresentedError | null> => {
    if (saving) return null;
    const { error } = await endSession();
    // No navigation here: RouteGuard reacts to the session change.
    return describeAuthError(error);
  };

  return {
    name,
    username,
    setName,
    setUsername,
    changed,
    saving,
    // Newest state wins: an unsaved pick previews immediately, then the
    // just-uploaded photo, then the signed URL of the stored path.
    avatarUri: avatarDraft?.uri ?? uploadedAvatarUri ?? signedUrl,
    pickAvatar,
    save,
    signOut,
  };
}
