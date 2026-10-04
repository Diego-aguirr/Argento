import type { AuthError, Session, User } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { supabase } from '@/lib/supabase/client';
import { fetchProfile, type Profile } from '@/lib/supabase/profiles';

export type SignInResult = {
  error: AuthError | null;
};

export type SignUpResult = {
  error: AuthError | null;
  /** True when the account was created but Supabase is still waiting for email confirmation. */
  needsEmailConfirmation: boolean;
};

export type SignOutResult = {
  error: AuthError | null;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  /** True until the persisted session has been read from storage. */
  loading: boolean;
  /** Profile row of the signed-in user, or null while signed out / not loaded yet. */
  profile: Profile | null;
  /** True while the profile row is being read. Independent of `loading`. */
  profileLoading: boolean;
  /** Re-reads the profile row for the signed-in user. No-op when signed out. */
  refreshProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  signOut: () => Promise<SignOutResult>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!cancelled) setSession(data.session);
      })
      .catch(() => {
        // No persisted session readable (e.g. first launch offline): start signed out.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user?.id;

  // The profile loads in its own effect so `loading` keeps its exact meaning
  // ("the persisted session has been read"). Sharing it would hold the app on
  // the splash screen for the profile round-trip and bring back the cold-start
  // flash this guard exists to prevent.
  useEffect(() => {
    let cancelled = false;

    // Async on purpose: setState only ever runs in a continuation, never
    // synchronously in the effect body (react-hooks/set-state-in-effect).
    const load = async () => {
      if (!userId) {
        setProfile(null);
        setProfileLoading(false);
        return;
      }

      setProfileLoading(true);
      try {
        const { profile: fetched } = await fetchProfile(userId);
        if (cancelled) return;
        setProfile(fetched);
      } catch {
        // No answer (offline, host down): show nothing rather than leave
        // routing stuck on profileLoading forever.
        if (cancelled) return;
        setProfile(null);
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const refreshProfile = async (): Promise<void> => {
    if (!userId) return;

    setProfileLoading(true);
    try {
      const { profile: fetched } = await fetchProfile(userId);
      setProfile(fetched);
    } catch {
      setProfile(null);
    } finally {
      setProfileLoading(false);
    }
  };

  const signIn = async (email: string, password: string): Promise<SignInResult> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    return { error };
  };

  const signUp = async (email: string, password: string): Promise<SignUpResult> => {
    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
      return { error, needsEmailConfirmation: false };
    }

    return {
      error: null,
      needsEmailConfirmation: data.user !== null && data.session === null,
    };
  };

  const signOut = async (): Promise<SignOutResult> => {
    const { error } = await supabase.auth.signOut();

    return { error };
  };

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    loading,
    profile,
    profileLoading,
    refreshProfile,
    signIn,
    signUp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
