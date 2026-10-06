import { Image } from 'expo-image';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Spacing } from '@/constants/theme';

type CreatePostModalProps = {
  imageUri: string;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (description: string) => void;
};

/**
 * Review step of the create-post flow: cropped preview plus the optional
 * description (README "Creating a post"). The parent mounts this only while a
 * draft exists, so cancel, success, and a fresh pick all reset the local
 * description by unmounting — no set-state-in-effect reset needed.
 */
export function CreatePostModal({
  imageUri,
  submitting,
  onCancel,
  onSubmit,
}: CreatePostModalProps) {
  const [description, setDescription] = useState('');

  return (
    <Modal visible animationType="slide" onRequestClose={submitting ? undefined : onCancel}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>New post</Text>
            <Text style={styles.subtitle}>One photo a day. 24h, then it&apos;s gone.</Text>
          </View>

          <Image
            source={{ uri: imageUri }}
            style={styles.preview}
            contentFit="cover"
            accessibilityLabel="Photo preview"
          />

          <TextInput
            style={styles.input}
            value={description}
            onChangeText={setDescription}
            placeholder="Add a description"
            placeholderTextColor="#999"
            multiline
            textAlignVertical="top"
            editable={!submitting}
          />

          <View style={styles.actions}>
            <Pressable
              style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
              onPress={onCancel}
              disabled={submitting}
              hitSlop={8}>
              <Text style={styles.cancelLabel}>Cancel</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.postButton,
                pressed && styles.pressed,
                submitting && styles.buttonDisabled,
              ]}
              disabled={submitting}
              onPress={() => onSubmit(description)}>
              <Text style={styles.postLabel}>{submitting ? 'Posting…' : 'Post'}</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
    paddingHorizontal: Spacing.four,
  },
  header: {
    alignItems: 'center',
    gap: Spacing.half,
    paddingTop: Spacing.three,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.light.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: 'center',
  },
  preview: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: Spacing.three,
    backgroundColor: Colors.light.backgroundElement,
    marginTop: Spacing.three,
  },
  input: {
    marginTop: Spacing.three,
    minHeight: 72,
    fontSize: 16,
    color: Colors.light.text,
    borderWidth: 1,
    borderColor: Colors.light.backgroundSelected,
    borderRadius: 8,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    backgroundColor: Colors.light.background,
  },
  actions: {
    marginTop: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: Spacing.three,
  },
  cancelButton: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: 8,
  },
  cancelLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.textSecondary,
  },
  postButton: {
    minWidth: 96,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: 8,
    backgroundColor: Colors.light.text,
    alignItems: 'center',
  },
  postLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.background,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.8,
  },
});
