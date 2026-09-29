import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { Pressable } from 'react-native';

import { colors, spacing } from '@/theme';

export function HeaderProfileButton({ href }: { href: Href }) {
  return (
    <Pressable
      onPress={() => router.push(href)}
      accessibilityRole="button"
      accessibilityLabel="Profile"
      hitSlop={12}
      style={{ paddingHorizontal: spacing.lg }}
    >
      <Ionicons name="person-circle-outline" size={28} color={colors.primary} />
    </Pressable>
  );
}
