import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { familyWebAccessState } from '../../lib/familyWebAccess';
import { subscriptionDestination } from '../../lib/playBillingWeb';
import BillingWaitGestorPage from '../../pages/BillingWaitGestorPage';
import PageLoader from '../PageLoader';

export default function FamilyProtectedRoute({ children, allowedRoles }) {
  const { user, effectiveSubscription, loading, profileLoading } = useAuth();
  const state = familyWebAccessState(user, effectiveSubscription, { loading, profileLoading });
  if (state === 'checking') return <PageLoader message="Verificando seu acesso…" />;
  if (state === 'signed_out') return <Navigate to="/login" replace />;
  if (state === 'no_family') return <Navigate to="/register" replace />;
  if (state === 'unavailable') return <BillingWaitGestorPage />;
  if (state === 'blocked') return <Navigate to={subscriptionDestination(user, effectiveSubscription)} replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={subscriptionDestination(user, effectiveSubscription)} replace />;
  }
  return children;
}
