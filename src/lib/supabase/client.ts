import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Expo inlines these at bundle time. The reference must stay a static
// dot-property access — bracket notation or destructuring is not inlined.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase configuration. Set EXPO_PUBLIC_SUPABASE_URL and ' +
      'EXPO_PUBLIC_SUPABASE_ANON_KEY in .env, then restart the dev server.',
  );
}

// Expo Router pre-renders the app in Node for `--web`, and `window` does not
// exist there: AsyncStorage's web backend reads window.localStorage and would
// throw while Supabase looks for a saved session. Report "nothing saved" on
// the server; the browser reads localStorage for real once it hydrates.
const hasDom = () => typeof window !== 'undefined';

const storage = {
  getItem: async (key: string): Promise<string | null> =>
    (hasDom() ? AsyncStorage.getItem(key) : null),
  setItem: async (key: string, value: string): Promise<void> => {
    if (hasDom()) await AsyncStorage.setItem(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    if (hasDom()) await AsyncStorage.removeItem(key);
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    // Password auth only: no session ever arrives back in the URL.
    detectSessionInUrl: false,
  },
});
