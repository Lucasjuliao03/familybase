import { useEffect } from 'react';
import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import {
  AuthProvider,
  useAuth,
  isFamilyBillingBlocked,
  userCanManageFamilyBilling,
} from '../src/contexts/AuthContext';
import '../src/lib/locationBackgroundTask';
import { FirstAccessPasswordModal } from '../src/components/auth/FirstAccessPasswordModal';
import { AppErrorBoundary } from '../src/components/ui/AppErrorBoundary';
import { AppSettingsProvider, AppAnnouncement } from '../src/contexts/AppSettingsContext';
import { AppSafeArea } from '../src/components/ui/AppSafeArea';

function RootLayoutNav() {
  const { user, family, effectiveSubscription, loading, profileLoading, isChildProxy } = useAuth();
  const segments: readonly string[] = useSegments();
  const router = useRouter();
  const navigationState = useRootNavigationState();

  useEffect(() => {
    if (loading || profileLoading || !navigationState?.key) return;

    const currentSegment = segments[0] as string | undefined;
    if (currentSegment === 'auth-confirm') return;
    const publicRoutes = ['login', 'onboarding', 'register', 'index','auth-confirm'];
    const billingRoutes = ['subscribe', 'billing-wait-gestor'];

    if (!user) {
      if (!publicRoutes.includes(currentSegment || '')) {
        router.replace('/login');
      }
      return;
    }

    if (!user.family_id && user.role !== 'master') {
      if (currentSegment !== 'register') router.replace('/register');
      return;
    }
    if (user.role === 'parent' && !user.has_onboarded) {
      if (currentSegment !== 'parent' || segments[1] !== 'onboarding') {
        router.replace('/parent/onboarding');
      }
      return;
    }

    if (user.role === 'master') {
      if (currentSegment !== 'master') {
        router.replace('/master');
      }
      return;
    }

    const billingBlocked = isFamilyBillingBlocked(family, effectiveSubscription);
    if (billingBlocked) {
      const canPay = userCanManageFamilyBilling(user, effectiveSubscription);
      const dest = canPay ? '/subscribe' : '/billing-wait-gestor';
      if (!billingRoutes.includes(currentSegment || '')) {
        router.replace(dest);
      }
      return;
    }

    if (isChildProxy && (user.role === 'parent' || user.role === 'relative')) {
      if (currentSegment !== 'child') {
        router.replace('/child');
      }
      return;
    }

    if (publicRoutes.includes(currentSegment || '') || billingRoutes.includes(currentSegment || '')) {
      const target = user.role === 'parent' || user.role === 'relative'
        ? 'parent'
        : user.role === 'child'
          ? 'child'
          : 'master';
      router.replace(`/${target}` as '/parent' | '/child' | '/master');
      return;
    }

    const role = user.role;
    const target = role === 'parent' || role === 'relative'
      ? 'parent'
      : role === 'child'
        ? 'child'
        : 'master';

    if (currentSegment !== target) {
      router.replace(`/${target}` as '/parent' | '/child' | '/master');
    }
  }, [user, family, effectiveSubscription, loading, profileLoading, isChildProxy, segments, router, navigationState?.key]);

  return (
    <>
      <AppAnnouncement />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
        }}
      />
      <FirstAccessPasswordModal />
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <AppSafeArea>
        <StatusBar style="dark" hidden={false} />
        <AppErrorBoundary>
          <AuthProvider>
            <AppSettingsProvider>
              <RootLayoutNav />
            </AppSettingsProvider>
          </AuthProvider>
        </AppErrorBoundary>
      </AppSafeArea>
    </SafeAreaProvider>
  );
}
