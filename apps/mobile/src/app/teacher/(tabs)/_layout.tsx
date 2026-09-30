import { Tabs } from 'expo-router';

import { FloatingTabBar } from '@/components/FloatingTabBar';
import { LiveSessionPill } from '@/components/LiveSessionPill';
import { HeaderProfileButton } from '@/components/HeaderProfileButton';
import { tabBarOptions } from '@/components/navOptions';
import { tabIcon } from '@/components/tabIcon';

export default function TeacherTabs() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} top={<LiveSessionPill />} />}
      screenOptions={{
        ...tabBarOptions,
        headerRight: () => <HeaderProfileButton href="/teacher/profile" />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Dashboard', tabBarLabel: 'Home', tabBarIcon: tabIcon('home-outline') }}
      />
      <Tabs.Screen
        name="classes"
        options={{ title: 'Classes', tabBarIcon: tabIcon('people-outline') }}
      />
      <Tabs.Screen
        name="schedule"
        options={{ title: 'Schedule', tabBarIcon: tabIcon('calendar-outline') }}
      />
      <Tabs.Screen
        name="attendance"
        options={{ title: 'Records', tabBarIcon: tabIcon('list-outline') }}
      />
    </Tabs>
  );
}
