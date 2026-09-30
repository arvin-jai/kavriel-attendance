import { Tabs } from 'expo-router';

import { FloatingTabBar } from '@/components/FloatingTabBar';
import { HeaderProfileButton } from '@/components/HeaderProfileButton';
import { tabBarOptions } from '@/components/navOptions';
import { tabIcon } from '@/components/tabIcon';

export default function StudentTabs() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        ...tabBarOptions,
        headerRight: () => <HeaderProfileButton href="/student/profile" />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Dashboard', tabBarLabel: 'Home', tabBarIcon: tabIcon('home-outline') }}
      />
      <Tabs.Screen
        name="classes"
        options={{ title: 'My Classes', tabBarIcon: tabIcon('people-outline') }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Scan QR',
          tabBarIcon: tabIcon('scan'),
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
