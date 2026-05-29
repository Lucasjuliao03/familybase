import { useEffect } from 'react';
import { useRouter, usePathname } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { moduleAllowed, anyModuleAllowed } from '../shared/lib/familyModules';

/** Mapeamento rota → módulo(s) exigidos */
const ROUTE_MODULES: Record<string, string | string[]> = {
  '/parent/tasks': 'tasks',
  '/child/tasks': 'tasks',
  '/parent/calendar': 'calendar',
  '/child/calendar': 'calendar',
  '/parent/allowance': ['allowance', 'piggy_bank', 'goals'],
  '/child/allowance': ['allowance', 'piggy_bank', 'goals'],
  '/parent/store': 'family_shop',
  '/child/store': 'family_shop',
  '/parent/health': 'health',
  '/child/health': 'health',
  '/parent/mural': 'mural',
  '/child/mural': 'mural',
  '/parent/shopping': 'shopping',
  '/child/shopping': 'shopping',
  '/parent/grades': 'grades',
  '/child/grades': 'grades',
  '/parent/location': 'location',
  '/child/location': 'location',
};

function isRouteAllowed(modules: Record<string, boolean>, keys: string | string[]): boolean {
  if (Array.isArray(keys)) return anyModuleAllowed(modules, keys);
  return moduleAllowed(modules, keys);
}

/**
 * Guard centralizado — usar nos layouts parent/child.
 */
export function useRouteModuleGuard(homePath: '/parent' | '/child') {
  const { modules, loading, user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (loading || !user) return;
    const required = ROUTE_MODULES[pathname];
    if (!required) return;
    if (!isRouteAllowed(modules as Record<string, boolean>, required)) {
      router.replace(homePath);
    }
  }, [pathname, modules, loading, user, router, homePath]);
}
