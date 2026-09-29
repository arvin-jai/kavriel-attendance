import { Tabs } from 'expo-router';

import { HeaderProfileButton } from '@/components/HeaderProfileButton';
import { tabIcon } from '@/components/tabIcon';
import { colors } from '@/theme';

export default function TeacherTabs() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        headerTitleStyle: { color: colors.text },
        headerRight: () => <HeaderProfileButton href="/teacher/profile" />,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: tabIcon('home-outline') }} />
      <Tabs.Screen
        name="subjects"
        options={{ title: 'Subjects', tabBarIcon: tabIcon('book-outline') }}
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
        options={{ title: 'Attendance', tabBarIcon: tabIcon('checkmark-done-outline') }}
      />
    </Tabs>
  );
}
