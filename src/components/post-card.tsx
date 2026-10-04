import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { FeedPost } from '@/lib/supabase/posts';

import { Colors, Spacing } from '@/constants/theme';

/**
 * Owns its own interval so a tick re-renders only the badge, not the whole
 * list row: 50 rows would otherwise re-render every 15 seconds.
 */
function CountdownBadge({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{remainingLabel(expiresAt, now)}</Text>
    </View>
  );
}

function remainingLabel(expiresAt: string, nowMs: number): string {
  const msLeft = new Date(expiresAt).getTime() - nowMs;
  if (msLeft <= 0) return 'Expired';

  // Floor keeps the countdown honest; the max avoids "0m left" in the last minute.
  const minutesLeft = Math.max(1, Math.floor(msLeft / 60000));

  if (minutesLeft >= 60) {
    return `${Math.floor(minutesLeft / 60)}h ${minutesLeft % 60}m left`;
  }

  return `${minutesLeft}m left`;
}

export function PostCard({ post }: { post: FeedPost }) {
  const fallback = post.profile?.name ?? post.profile?.username ?? '?';
  const initial = fallback.charAt(0).toUpperCase();

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        {post.avatarUrl ? (
          <Image source={{ uri: post.avatarUrl }} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarInitial}>{initial}</Text>
          </View>
        )}
        <View style={styles.author}>
          <Text style={styles.name}>
            {post.profile?.name ?? post.profile?.username ?? 'Unknown'}
          </Text>
          {post.profile?.username ? (
            <Text style={styles.username}>@{post.profile.username}</Text>
          ) : null}
        </View>
      </View>

      {post.imageUrl ? (
        <Image source={{ uri: post.imageUrl }} style={styles.photo} contentFit="cover" />
      ) : null}

      {post.description ? <Text style={styles.description}>{post.description}</Text> : null}

      <CountdownBadge expiresAt={post.expiresAt} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.light.background,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    gap: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.backgroundSelected,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.light.backgroundElement,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.textSecondary,
  },
  author: {
    flex: 1,
    gap: Spacing.half,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
  },
  username: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  photo: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: Spacing.three,
    backgroundColor: Colors.light.backgroundElement,
  },
  description: {
    fontSize: 14,
    color: Colors.light.text,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.light.backgroundElement,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.light.textSecondary,
  },
});
