import { useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { moduleAllowed } from '../shared/lib/familyModules';

/**
 * Redirecciona para o dashboard do role se o módulo estiver desactivado.
 */
export function useModuleGuard(moduleKey: string) {
  const { modules, loading, user } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const roleSegment = segments[0];

  useEffect(() => {
    if (loading || !user) return;
    if (!moduleAllowed(modules, moduleKey)) {
      const home = roleSegment === 'child' ? '/child' : roleSegment === 'master' ? '/master' : '/parent';
      router.replace(home as '/parent' | '/child' | '/master');
    }
  }, [modules, moduleKey, loading, user, router, roleSegment]);
}
