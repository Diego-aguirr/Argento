import { Image } from 'expo-image';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/AuthContext';
import { describePostgrestError } from '@/lib/db-errors';
import { pickCroppedImage, type ImagePickSource, type PickedImage } from '@/lib/image-picker';
import { saveProfile, uploadProfileImage } from '@/lib/supabase/profiles';

export default function OnboardingScreen() {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  // Local photo draft: picked + previewed here, uploaded only on Continue.
  const [photo, setPhoto] = useState<PickedImage | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { user, refreshProfile } = useAuth();

  const handlePickPhoto = async (source: ImagePickSource) => {
    const picked = await pickCroppedImage(source);
    if (!picked) return; // user canceled the picker
    if ('title' in picked) {
      Alert.alert(picked.title, picked.message);
      return;
    }
    setPhoto(picked);
  };

  const handleAvatarPress = () => {
    if (submitting) return;
    Alert.alert('Profile photo', 'Add a photo so your friends recognize you.', [
      { text: 'Take photo', onPress: () => void handlePickPhoto('camera') },
      { text: 'Choose from library', onPress: () => void handlePickPhoto('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleContinue = async () => {
    if (submitting) return;

    const trimmedName = name.trim();
    const trimmedUsername = username.trim();
    if (!trimmedName || !trimmedUsername) {
      Alert.alert('Missing details', 'Enter a name and a username to continue.');
      return;
    }

    if (!user) return;

    setSubmitting(true);
    try {
      let profileImageUrl: string | null | undefined;

      if (photo) {
        const { path, error: uploadError } = await uploadProfileImage(
          user.id,
          photo.bytes,
          photo.mimeType,
        );
        const presentedUpload = describePostgrestError(uploadError);
        if (presentedUpload) {
          // Keep the photo draft: the user retries without re-picking.
          Alert.alert(presentedUpload.title, presentedUpload.message);
          return;
        }
        profileImageUrl = path;
      }

      const { error } = await saveProfile(user.id, {
        name: trimmedName,
        username: trimmedUsername,
        // Only sent when a photo was picked, so saving without a photo
        // never nulls out an avatar that already exists.
        ...(profileImageUrl !== undefined ? { profileImageUrl } : {}),
      });

      const presented = describePostgrestError(error);
      if (presented) {
        // Save failed: keep the draft so a retry reuses the picked photo.
        Alert.alert(presented.title, presented.message);
        return;
      }

      setPhoto(null);
      // No navigation here: RouteGuard reacts to onboarding_completed and
      // moves the user to the tabs on its own.
      await refreshProfile();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>A couple of details</Text>
        <Text style={styles.subtitle}>This is how your friends will find you.</Text>

        <Pressable
          style={styles.avatarWrapper}
          onPress={handleAvatarPress}
          disabled={submitting}
          accessibilityRole="button"
          accessibilityLabel={photo ? 'Change profile photo' : 'Add profile photo'}>
          {photo ? (
            <Image source={{ uri: photo.uri }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={styles.avatarPlaceholder} />
          )}
          <View style={styles.avatarBadge}>
            <Text style={styles.avatarBadgeText}>+</Text>
          </View>
        </Pressable>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Name"
            placeholderTextColor="#999"
            autoCapitalize="words"
          />
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="Username"
            placeholderTextColor="#999"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              submitting && styles.buttonDisabled,
            ]}
            disabled={submitting}
            onPress={handleContinue}>
            <Text style={styles.buttonText}>{submitting ? 'Saving…' : 'Continue'}</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
  },
  avatarWrapper: {
    marginTop: 28,
  },
  avatar: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: '#eee',
  },
  avatarPlaceholder: {
    width: 104,
    height: 104,
    borderRadius: 52,
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
    gap: 12,
    marginTop: 32,
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
  button: {
    marginTop: 8,
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
});
