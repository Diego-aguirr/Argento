import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { useAuth } from '@/context/AuthContext';
import { useProfileEdit } from '@/hooks/useProfileEdit';
import type { ImagePickSource } from '@/lib/image-picker';
import type { Profile } from '@/lib/supabase/profiles';

import { BottomTabInset, Spacing } from '@/constants/theme';

export default function ProfileScreen() {
  const { user, profile } = useAuth();

  // RouteGuard redirects as soon as it knows the outcome (no session →
  // login, no completed profile → onboarding); until then show the read.
  if (!user || !profile) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#000" />
        </View>
      </SafeAreaView>
    );
  }

  // Keyed by id so the edit drafts re-seed when the row first arrives — the
  // tab can mount before the profile has finished loading.
  return <ProfileView key={profile.id} profile={profile} email={user.email ?? ''} />;
}

function ProfileView({ profile, email }: { profile: Profile; email: string }) {
  const {
    name,
    username,
    setName,
    setUsername,
    changed,
    saving,
    avatarUri,
    pickAvatar,
    save,
    signOut,
  } = useProfileEdit(profile);

  const fallback = profile.name || profile.username || '?';

  const runPick = (source: ImagePickSource) => {
    void pickAvatar(source).then((presented) => {
      if (presented) Alert.alert(presented.title, presented.message);
    });
  };

  const handleAvatarPress = () => {
    if (saving) return;
    Alert.alert('Profile photo', 'Take a photo or choose one from your library.', [
      { text: 'Take photo', onPress: () => runPick('camera') },
      { text: 'Choose from library', onPress: () => runPick('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleSave = () => {
    void save().then((presented) => {
      if (presented) Alert.alert(presented.title, presented.message);
    });
  };

  const handleSignOut = () => {
    void signOut().then((presented) => {
      if (presented) Alert.alert(presented.title, presented.message);
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled">
          <View style={styles.topGroup}>
            <Text style={styles.title}>Profile</Text>

            <Pressable
              style={styles.avatarWrapper}
              onPress={handleAvatarPress}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel={avatarUri ? 'Change profile photo' : 'Add profile photo'}>
              <Avatar uri={avatarUri} name={fallback} size={116} style={styles.avatar} />
              <View style={styles.avatarBadge}>
                <Text style={styles.avatarBadgeText}>+</Text>
              </View>
            </Pressable>

            <View style={styles.form}>
              <View style={styles.field}>
                <Text style={styles.label}>Name</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="Name"
                  placeholderTextColor="#999"
                  autoCapitalize="words"
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Username</Text>
                <TextInput
                  style={styles.input}
                  value={username}
                  onChangeText={setUsername}
                  placeholder="Username"
                  placeholderTextColor="#999"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Email</Text>
                <Text style={styles.readonlyValue} selectable>
                  {email}
                </Text>
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  pressed && styles.buttonPressed,
                  (!changed || saving) && styles.buttonDisabled,
                ]}
                disabled={!changed || saving}
                onPress={handleSave}
                accessibilityRole="button"
                accessibilityLabel="Save profile changes">
                <Text style={styles.buttonText}>{saving ? 'Saving…' : 'Save'}</Text>
              </Pressable>
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.signOutButton,
              pressed && styles.signOutPressed,
              saving && styles.buttonDisabled,
            ]}
            disabled={saving}
            onPress={handleSignOut}
            accessibilityRole="button"
            accessibilityLabel="Sign out">
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  content: {
    flexGrow: 1,
    // Top group stays at the top; the destructive action lands at the
    // bottom when there is room and directly under Save when there is not.
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four,
  },
  topGroup: {
    width: '100%',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000',
    textAlign: 'center',
  },
  avatarWrapper: {
    marginTop: Spacing.four,
  },
  avatar: {
    backgroundColor: '#eee',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  avatarBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#000',
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBadgeText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 24,
  },
  form: {
    width: '100%',
    gap: Spacing.three,
    marginTop: Spacing.five,
  },
  field: {
    gap: Spacing.one,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  input: {
    fontSize: 16,
    color: '#000',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  readonlyValue: {
    fontSize: 16,
    color: '#666',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f5f5f5',
  },
  button: {
    marginTop: Spacing.two,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: '#000',
    alignItems: 'center',
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  signOutButton: {
    marginTop: Spacing.five,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d32f2f',
    alignItems: 'center',
  },
  signOutPressed: {
    opacity: 0.7,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#d32f2f',
  },
});
