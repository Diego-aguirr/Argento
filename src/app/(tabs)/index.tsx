import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CreatePostModal } from '@/components/create-post-modal';
import { PostCard } from '@/components/post-card';
import { useCreatePost, type PostImageSource } from '@/hooks/useCreatePost';
import { usePosts } from '@/hooks/usePosts';

import { BottomTabInset, Colors, Spacing } from '@/constants/theme';

export default function HomeScreen() {
  const { posts, loading, refreshing, error, refresh } = usePosts();
  const { draft, submitting, pickImage, clearDraft, submit } = useCreatePost();

  // The first load has nothing on screen yet; once posts exist, refreshes
  // never replace the list with a spinner.
  const showLoader = loading && posts.length === 0;
  const showRetry = !showLoader && error !== null && posts.length === 0;
  const showEmpty = !showLoader && !showRetry && posts.length === 0;

  const runPick = (source: PostImageSource) => {
    void pickImage(source).then((presented) => {
      if (presented) Alert.alert(presented.title, presented.message);
    });
  };

  const handleCreatePress = () => {
    Alert.alert('Create a post', 'Take a photo or choose one from your library.', [
      { text: 'Take photo', onPress: () => runPick('camera') },
      { text: 'Photo library', onPress: () => runPick('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleSubmitPost = async (description: string) => {
    const presented = await submit(description);
    if (presented) {
      Alert.alert(presented.title, presented.message);
      return;
    }
    // Success: the draft closed itself; reload the feed so the new post shows.
    await refresh();
  };

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
        <Text style={styles.stateMessage}>Tap + to share your first photo.</Text>
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

  return (
    <SafeAreaView style={styles.container}>
      {content}
      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={handleCreatePress}
        accessibilityRole="button"
        accessibilityLabel="Create a post">
        <Text style={styles.fabIcon}>+</Text>
      </Pressable>
      {draft ? (
        <CreatePostModal
          imageUri={draft.uri}
          submitting={submitting}
          onCancel={clearDraft}
          onSubmit={handleSubmitPost}
        />
      ) : null}
    </SafeAreaView>
  );
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
  fab: {
    position: 'absolute',
    right: Spacing.four,
    // Sits above the native tab bar overlay, clear of the last list row.
    bottom: BottomTabInset + Spacing.four,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.light.text,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  fabPressed: {
    opacity: 0.8,
  },
  fabIcon: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '600',
    color: Colors.light.background,
  },
});
