import type { PostgrestError } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { PresentedError } from '@/lib/auth-errors';
import { describePostgrestError } from '@/lib/db-errors';
import { fetchFeed, type FeedPost } from '@/lib/supabase/posts';

export type UsePostsResult = {
  posts: FeedPost[];
  /** True only until the first load settles. */
  loading: boolean;
  /** True while refresh() runs; drives RefreshControl. */
  refreshing: boolean;
  error: PresentedError | null;
  refresh: () => Promise<void>;
};

export function usePosts(): UsePostsResult {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<PresentedError | null>(null);
  const inFlight = useRef(false);

  const refresh = useCallback(async (): Promise<void> => {
    // RefreshControl and the retry button can fire while a run is open.
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);

    try {
      const { posts: next, error: fetchError } = await fetchFeed();
      setError(describePostgrestError(fetchError));
      // A failed refresh keeps the posts already on screen.
      if (!fetchError) setPosts(next);
    } catch (cause) {
      setError(describePostgrestError(cause as PostgrestError));
    } finally {
      inFlight.current = false;
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Async on purpose: setState only runs in continuations, never
    // synchronously in the effect body (react-hooks/set-state-in-effect).
    const load = async () => {
      try {
        const { posts: next, error: fetchError } = await fetchFeed();
        if (cancelled) return;
        setError(describePostgrestError(fetchError));
        if (!fetchError) setPosts(next);
      } catch (cause) {
        if (cancelled) return;
        setError(describePostgrestError(cause as PostgrestError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  return { posts, loading, refreshing, error, refresh };
}
