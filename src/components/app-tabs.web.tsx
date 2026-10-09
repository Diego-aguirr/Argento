import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';
import { Pressable, PressableProps, View, StyleSheet } from 'react-native';

import { Spacing } from '@/constants/theme';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      {/*
       * This TabList stays in the tree but hidden: expo-router builds the web
       * tab screens from the TabTriggers inside it, so deleting them would
       * leave TabSlot with nothing to render. display: 'none' keeps routing
       * intact while leaving the top of the screen blank.
       */}
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="home" href="/" asChild>
            <TabButton>Home</TabButton>
          </TabTrigger>
          <TabTrigger name="profile" href="/profile" asChild>
            <TabButton>Profile</TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

export function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  return (
    // Cast works around an RN 0.88-rc ref type mismatch between
    // expo-router/ui TabTriggerSlotProps and React Native's Pressable types.
    <Pressable
      {...(props as unknown as PressableProps)}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <ThemedView
        type={isFocused ? 'backgroundSelected' : 'backgroundElement'}
        style={styles.tabButtonView}>
        <ThemedText type="small" themeColor={isFocused ? 'text' : 'textSecondary'}>
          {children}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

export function CustomTabList(props: TabListProps) {
  return <View {...props} style={styles.tabListContainer}>{props.children}</View>;
}

const styles = StyleSheet.create({
  tabListContainer: {
    display: 'none',
  },
  pressed: {
    opacity: 0.7,
  },
  tabButtonView: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
});
