import React from 'react';
import { Tabs, Redirect } from 'expo-router';
import {
  TrainFront,
  MapPin,
  Users,
  ClipboardList,
  LogOut,
  Crown,
} from 'lucide-react-native';
import { TouchableOpacity, View, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '@/lib/auth';
import { theme } from '@/lib/theme';
import { isPrivileged } from '@/types/database';

export default function TabLayout() {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={theme.primary[600]} />
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/login" />;
  }

  const privileged = isPrivileged(user.role);
  const isOwner = user.role === 'owner';

  const screenDefs: Array<{
    name: string;
    title: string;
    privilegedOnly?: boolean;
  }> = [
    { name: 'index', title: 'Attendance' },
    { name: 'locations', title: 'Locations', privilegedOnly: true },
    { name: 'employees', title: 'Staff', privilegedOnly: true },
    { name: 'records', title: 'Records', privilegedOnly: true },
  ];

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerTitleAlign: 'center',
        headerShadowVisible: false,
        headerStyle: {
          backgroundColor: theme.neutral[0],
        },
        headerTitleStyle: {
          fontFamily: 'Inter-SemiBold',
          fontSize: theme.fontSize.lg,
          color: theme.neutral[800],
        },
        headerLeft: () => {
          if (isOwner) {
            return <View style={styles.headerLeft}><Crown size={18} color={theme.warning[500]} strokeWidth={2} /></View>;
          }
          return null;
        },
        headerRight: () => (
          <TouchableOpacity onPress={logout} style={styles.logoutBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <LogOut size={20} color={theme.error[500]} strokeWidth={2} />
          </TouchableOpacity>
        ),
        tabBarStyle: {
          backgroundColor: theme.neutral[0],
          borderTopWidth: 1,
          borderTopColor: theme.neutral[200],
          height: 60,
          paddingBottom: 6,
          paddingTop: 6,
        },
        tabBarActiveTintColor: theme.primary[600],
        tabBarInactiveTintColor: theme.neutral[400],
        tabBarLabelStyle: {
          fontFamily: 'Inter-Medium',
          fontSize: theme.fontSize.xs,
        },
        tabBarItemStyle: {
          gap: 2,
        },
      }}
    >
      {screenDefs.map((s) => {
        if (s.privilegedOnly && !privileged) return null;
        return (
          <Tabs.Screen
            key={s.name}
            name={s.name}
            options={{
              title: s.title,
              tabBarIcon: ({ color }) => {
                const icons: Record<string, React.ReactNode> = {
                  index: <TrainFront size={22} color={color} strokeWidth={2} />,
                  locations: <MapPin size={22} color={color} strokeWidth={2} />,
                  employees: <Users size={22} color={color} strokeWidth={2} />,
                  records: <ClipboardList size={22} color={color} strokeWidth={2} />,
                };
                return icons[s.name];
              },
            }}
          />
        );
      })}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.neutral[50],
  },
  logoutBtn: {
    paddingHorizontal: theme.spacing.sm,
    marginRight: theme.spacing.xs,
  },
  headerLeft: {
    paddingLeft: theme.spacing.md,
  },
});
