import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PostCard } from '@/components/post-card';
import { usePosts } from '@/hooks/usePosts';

import { BottomTabInset, Colors, Spacing } from '@/constants/theme';

export default function HomeScreen() {
  const { posts, loading, refreshing, error, refresh } = usePosts();

  // The first load has nothing on screen yet; once posts exist, refreshes
  // never replace the list with a spinner.
  const showLoader = loading && posts.length === 0;
  const showRetry = !showLoader && error !== null && posts.length === 0;
  const showEmpty = !showLoader && !showRetry && posts.length === 0;

  let content: ReactNode;
  if (showLoader) {
    content = (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.light.text} />
      </View>
    );
  } else if (showRetry) {
    content = (
      <View style={styles.centered}>
        <Text style={styles.stateTitle}>{error.title}</Text>
        <Text style={styles.stateMessage}>{error.message}</Text>
        <Pressable style={styles.retryButton} onPress={refresh}>
          <Text style={styles.retryLabel}>Retry</Text>
        </Pressable>
      </View>
    );
  } else if (showEmpty) {
    content = (
      <View style={styles.centered}>
        <Text style={styles.stateTitle}>No posts yet</Text>
        <Text style={styles.stateMessage}>Take your first photo from the camera tab.</Text>
      </View>
    );
  } else {
    content = (
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <PostCard post={item} />}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      />
    );
  }

  return <SafeAreaView style={styles.container}>{content}</SafeAreaView>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  stateTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.light.text,
    textAlign: 'center',
  },
  stateMessage: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: Spacing.two,
    backgroundColor: Colors.light.text,
    borderRadius: Spacing.five,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  retryLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.background,
  },
  listContent: {
    // Same bottom inset explore.tsx uses: keeps the last post above the tab bar.
    paddingBottom: BottomTabInset + Spacing.three,
  },
});
