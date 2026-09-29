import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { View } from 'react-native';

import { HeaderProfileButton } from '@/components/HeaderProfileButton';
import { tabIcon } from '@/components/tabIcon';
import { colors } from '@/theme';

/** Raised centre button so the scanner is always one tap away. */
function ScanIcon({ focused }: { focused: boolean }) {
  return (
    <View
      style={{
        width: 56,
        height: 56,
        borderRadius: 28,
        marginTop: -18,
        backgroundColor: focused ? colors.primaryDark : colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 4,
        borderColor: colors.surface,
      }}
    >
      <Ionicons name="scan" size={26} color={colors.white} />
    </View>
  );
}

export default function StudentTabs() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        headerTitleStyle: { color: colors.text },
        headerRight: () => <HeaderProfileButton href="/student/profile" />,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: tabIcon('home-outline') }} />
      <Tabs.Screen
        name="classes"
        options={{ title: 'My Classes', tabBarIcon: tabIcon('people-outline') }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Scan QR',
          tabBarIcon: ({ focused }) => <ScanIcon focused={focused} />,
          tabBarAccessibilityLabel: 'Scan attendance QR',
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{ title: 'Schedule', tabBarIcon: tabIcon('calendar-outline') }}
      />
      <Tabs.Screen
        name="attendance"
        options={{ title: 'Attendance', tabBarIcon: tabIcon('checkmark-done-outline') }}
      />
    </Tabs>
  );
}
