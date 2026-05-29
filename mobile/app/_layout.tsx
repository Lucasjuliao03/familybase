import { useEffect } from 'react';
import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  AuthProvider,
  useAuth,
  isFamilyBillingBlocked,
  userCanManageFamilyBilling,
} from '../src/contexts/AuthContext';
import '../src/lib/locationBackgroundTask';
import { FirstAccessPasswordModal } from '../src/components/auth/FirstAccessPasswordModal';

function RootLayoutNav() {
  const { user, family, effectiveSubscription, loading, isChildProxy } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const navigationState = useRootNavigationState();

  useEffect(() => {
    if (loading || !navigationState?.key) return;

    const currentSegment = segments[0] as string | undefined;
    const publicRoutes = ['login', 'onboarding', 'register'];
    const billingRoutes = ['subscribe', 'billing-wait-gestor'];

    if (!user) {
      if (!publicRoutes.includes(currentSegment || '')) {
        router.replace('/onboarding');
      }
      return;
    }

    // Bloqueia rotas se não fez onboarding (apenas para responsáveis)
    if (user.role === 'parent' && !user.has_onboarded) {
      if (currentSegment !== 'parent' || segments[1] !== 'onboarding') {
        router.replace('/parent/onboarding');
      }
      return;
    }

    // Master bypass billing
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

    // Modo filho: o pai mantém a própria sessão mas navega pelas telas do filho.
    if (isChildProxy && (user.role === 'parent' || user.role === 'relative')) {
      if (currentSegment !== 'child') {
        router.replace('/child');
      }
      return;
    }

    // Bloqueia rotas públicas/billing quando autenticado com acesso
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
  }, [user, family, effectiveSubscription, loading, isChildProxy, segments, router, navigationState?.key]);

  return (
    <>
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
    <AuthProvider>
      <StatusBar style="light" />
      <RootLayoutNav />
    </AuthProvider>
  );
}
