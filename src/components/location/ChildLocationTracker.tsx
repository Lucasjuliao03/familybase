import { useSegments } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { useGeolocation } from '../../hooks/useGeolocation';

/** Starts the child's foreground/background updates on login, not only on map visit. */
export function ChildLocationTracker() {
  const { user, isChildProxy } = useAuth();
  const segments: readonly string[] = useSegments();
  useGeolocation({
    familyId: user?.family_id,
    userId: user?.id,
    enabled: !isChildProxy && user?.role === 'child' && segments[1] !== 'location',
    shareWithChildren: true,
  });
  return null;
}
