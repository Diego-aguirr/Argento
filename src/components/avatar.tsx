import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Colors } from '@/constants/theme';

const PLACEHOLDER_SOURCE = require('@/assets/images/avatar-placeholder.png');

/**
 * One accessibility contract for every branch: the avatar is announced as a
 * photo, never as its bare initial (screen readers would read "A").
 */
const PHOTO_ACCESSIBILITY = {
  accessible: true,
  accessibilityRole: 'image',
  accessibilityLabel: 'Profile photo',
} as const;

type AvatarProps = {
  /** Signed URL or picked file. May be absent (no photo) or fail to load (expired). */
  uri: string | null | undefined;
  /** Name used to derive the initial-letter fallback when there is no URL. */
  name?: string | null;
  /** Circle diameter in density-independent pixels. */
  size: number;
  /** Frame overrides (background, border); size and borderRadius stay owned here. */
  style?: StyleProp<ViewStyle>;
};

/**
 * Shared avatar with a strict fallback ladder:
 *
 * 1. URL present and loads → photo.
 * 2. URL present but fails to load (expired signed URL, offline) → the
 *    placeholder asset. Signed URLs are short-lived, so a non-null URL is
 *    NOT a guarantee of a renderable image.
 * 3. No URL → the initial letter the feed already ships with, or the
 *    placeholder asset when no initial can be derived.
 *
 * The placeholder is therefore an ERROR fallback, not a replacement for the
 * initial-letter look — feed and profile follow the same rule.
 *
 * A View owns the circle (size, radius, clip, consumer style) because
 * ViewStyle and ImageStyle are not mutually assignable (overflow), and it
 * gives one accessibility node instead of one per branch.
 */
export function Avatar({ uri, name, size, style }: AvatarProps) {
  // Track WHICH url failed instead of a bare boolean: a refreshed or
  // re-signed URL must load again without needing a setState-in-effect reset.
  const [failedUri, setFailedUri] = useState<string | null>(null);

  const frameStyle = useMemo<StyleProp<ViewStyle>>(
    () => [styles.frame, { width: size, height: size, borderRadius: size / 2 }, style],
    [size, style],
  );

  const initial = name?.trim().charAt(0).toUpperCase() ?? '';
  const initialStyle = useMemo(
    () => ({ fontSize: Math.max(16, Math.round(size * 0.34)) }),
    [size],
  );

  if (uri && failedUri !== uri) {
    // `current` keeps the string narrowed inside the closure (params are
    // not narrowed in nested functions).
    const current = uri;
    return (
      <View style={frameStyle} {...PHOTO_ACCESSIBILITY}>
        <Image
          source={{ uri: current }}
          style={styles.fill}
          contentFit="cover"
          onError={() => setFailedUri(current)}
        />
      </View>
    );
  }

  if (!uri && initial) {
    return (
      <View style={frameStyle} {...PHOTO_ACCESSIBILITY}>
        <Text style={[styles.initial, initialStyle]}>{initial}</Text>
      </View>
    );
  }

  // Load error, or no URL and no derivable initial.
  return (
    <View style={frameStyle} {...PHOTO_ACCESSIBILITY}>
      <Image source={PLACEHOLDER_SOURCE} style={styles.fill} contentFit="cover" />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fill: {
    width: '100%',
    height: '100%',
  },
  initial: {
    fontWeight: '600',
    color: Colors.light.textSecondary,
  },
});
