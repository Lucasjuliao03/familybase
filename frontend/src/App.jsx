import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { useAppResume } from './hooks/useAppResume';
import { moduleAllowed, anyModuleAllowed } from './lib/familyModules';
import { LanguageProvider } from './contexts/LanguageContext';
import { ToastProvider } from './contexts/ToastContext';
import { PWAProvider } from './contexts/PWAContext';
import PWAInstallBanner from './components/PWAInstallBanner';
import PWAUpdateModal from './components/PWAUpdateModal';
import FirstAccessPasswordModal from './components/FirstAccessPasswordModal';
import PageLoader from './components/PageLoader';

// ─── Layouts (carregados antecipadamente — pequenos e usados em tudo) ─────────
import ParentLayout from './components/layout/ParentLayout';
import ChildLayout  from './components/layout/ChildLayout';
import MasterLayout from './components/layout/MasterLayout';

// ─── Auth (carregadas imediatamente — rota inicial para não-logados) ──────────
import LoginPage    from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import BillingWaitGestorPage from './pages/BillingWaitGestorPage';

// ─── Páginas pai — lazy (chunk: pages-parent) ─────────────────────────────────
const ParentDashboard      = lazy(() => import('./pages/parent/ParentDashboard'));
const TaskManager          = lazy(() => import('./pages/parent/TaskManager'));
const GradeTracker         = lazy(() => import('./pages/parent/GradeTracker'));
const AllowanceManager     = lazy(() => import('./pages/parent/AllowanceManager'));
const FamilyShopManager    = lazy(() => import('./pages/parent/FamilyShopManager'));
const CalendarPage         = lazy(() => import('./pages/parent/CalendarPage'));
const ShoppingList         = lazy(() => import('./pages/parent/ShoppingList'));
const ReportsPage          = lazy(() => import('./pages/parent/ReportsPage'));
const FamilyAdministration = lazy(() => import('./pages/parent/FamilyAdministration'));

// ─── Páginas filho — lazy (chunk: pages-child) ───────────────────────────────
const ChildDashboard = lazy(() => import('./pages/child/ChildDashboard'));
const MyTasks        = lazy(() => import('./pages/child/MyTasks'));
const MyGrades       = lazy(() => import('./pages/child/MyGrades'));
const MyAllowance    = lazy(() => import('./pages/child/MyAllowance'));
const MyFamilyShop   = lazy(() => import('./pages/child/MyFamilyShop'));
const MyCalendar     = lazy(() => import('./pages/child/MyCalendar'));

// ─── Módulos partilhados — lazy (chunk: pages-shared) ────────────────────────
const HealthCenter     = lazy(() => import('./pages/HealthCenter'));
const MuralBoard       = lazy(() => import('./pages/MuralBoard'));
const MasterDashboard  = lazy(() => import('./pages/master/MasterDashboard'));
const SubscribePage    = lazy(() => import('./pages/SubscribePage'));

// ─────────────────────────────────────────────────────────────────────────────
/** Loader único durante auth / guards (evita “casa estática”; PageLoader já tem spinner). */
const AuthLoading = ({ message }) => (
  <PageLoader message={message ?? 'A carregar…'} />
);

// ─────────────────────────────────────────────────────────────────────────────
function isTrialExpired(family) {
  if (!family) return false;
  if (family.subscription_status === 'active') return false;
  if (family.subscription_status === 'expired') return true;
  if (family.subscription_status === 'trial' && family.trial_ends_at) {
    return new Date(family.trial_ends_at).getTime() < Date.now();
  }
  const s = family.subscription_status;
  if (s === 'past_due' || s === 'cancelled') return true;
  return false;
}

/** Bloqueado por trial/assinatura ao nível da família (fallback se RPC falhar). */
function isFamilyBillingBlocked(family, effectiveSubscription) {
  if (effectiveSubscription && typeof effectiveSubscription.has_access === 'boolean') {
    return !effectiveSubscription.has_access;
  }
  return isTrialExpired(family);
}

/** Quem pode abrir checkout /manage plano (= gestor financeiro da família). */
function userCanManageFamilyBilling(user, effectiveSubscription) {
  if (effectiveSubscription?.can_manage_billing === true) return true;
  if (effectiveSubscription?.can_manage_billing === false) return false;
  if (!user || user.role === 'child' || user.role === 'relative') return false;
  if (user.role === 'parent') {
    const ap = user.access_profile ?? user.accessProfile ?? 'gestor';
    return ap === 'gestor';
  }
  return false;
}

function SubscribeGateway() {
  const { user, loading, effectiveSubscription } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (loading) return <AuthLoading message="A preparar conta…" />;
  if (user.role === 'master') return <Navigate to="/master" replace />;

  const canPay = userCanManageFamilyBilling(user, effectiveSubscription);
  if (!canPay) return <BillingWaitGestorPage />;

  return (
    <Suspense fallback={<PageLoader />}>
      <SubscribePage />
    </Suspense>
  );
}

function ProtectedRoute({ children, allowedRoles }) {
  const { user, family, effectiveSubscription, loading } = useAuth();
  if (loading) return <AuthLoading message="A carregar…" />;
  if (!user) return <Navigate to="/login" replace />;

  if (user.role !== 'master') {
    const blocked = isFamilyBillingBlocked(family, effectiveSubscription);
    if (blocked) {
      const dest = userCanManageFamilyBilling(user, effectiveSubscription) ? '/subscribe' : '/billing-wait-gestor';
      return <Navigate to={dest} replace />;
    }
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    if (user.role === 'master') return <Navigate to="/master" replace />;
    if (user.role === 'child')  return <Navigate to="/child"  replace />;
    return <Navigate to="/parent" replace />;
  }
  return children;
}

function GestorRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <AuthLoading />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'parent') return <Navigate to="/parent" replace />;
  const ap = user.access_profile ?? user.accessProfile ?? 'gestor';
  if (ap !== 'gestor') return <Navigate to="/parent" replace />;
  return children;
}

function ModuleRoute({ module: moduleKey, anyOf, children }) {
  const { user, modules, loading } = useAuth();
  const base = user?.role === 'child' ? '/child' : '/parent';
  if (loading) return <AuthLoading />;
  if (anyOf?.length) {
    if (!anyModuleAllowed(modules, anyOf)) return <Navigate to={base} replace />;
  } else if (moduleKey && !moduleAllowed(modules, moduleKey)) {
    return <Navigate to={base} replace />;
  }
  return children;
}

// ─────────────────────────────────────────────────────────────────────────────
function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <AuthLoading message="A iniciar sessão…" />;

  const defaultPath = () => {
    if (!user) return '/login';
    if (user.role === 'master') return '/master';
    if (user.role === 'child')  return '/child';
    return '/parent';
  };

  return (
    <Routes>
      <Route path="/login"    element={user ? <Navigate to={defaultPath()} /> : <LoginPage />} />
      <Route path="/register" element={user ? <Navigate to="/parent" />      : <RegisterPage />} />

      {/* ── Assinatura (acessível também durante o trial) ──────────────── */}
      <Route path="/subscribe" element={
        user ? <SubscribeGateway /> : <Navigate to="/login" replace />
      } />

      <Route path="/billing-wait-gestor" element={
        user ? <BillingWaitGestorPage /> : <Navigate to="/login" replace />
      } />

      {/* ── PARENT & RELATIVE ──────────────────────────────────────────── */}
      <Route path="/parent" element={
        <ProtectedRoute allowedRoles={['parent', 'relative']}>
          <ParentLayout />
        </ProtectedRoute>
      }>
        <Route index element={
          <Suspense fallback={<PageLoader />}>
            <ParentDashboard />
          </Suspense>
        } />
        <Route path="tasks" element={
          <ModuleRoute module="tasks">
            <Suspense fallback={<PageLoader />}><TaskManager /></Suspense>
          </ModuleRoute>
        } />
        <Route path="grades" element={
          <ModuleRoute module="grades">
            <Suspense fallback={<PageLoader />}><GradeTracker /></Suspense>
          </ModuleRoute>
        } />
        <Route path="allowance" element={
          <ModuleRoute anyOf={['allowance', 'piggy_bank', 'goals']}>
            <Suspense fallback={<PageLoader />}><AllowanceManager /></Suspense>
          </ModuleRoute>
        } />
        <Route path="family-shop" element={
          <ModuleRoute module="family_shop">
            <Suspense fallback={<PageLoader />}><FamilyShopManager /></Suspense>
          </ModuleRoute>
        } />
        <Route path="calendar" element={
          <ModuleRoute module="calendar">
            <Suspense fallback={<PageLoader />}><CalendarPage /></Suspense>
          </ModuleRoute>
        } />
        <Route path="shopping" element={
          <ModuleRoute module="shopping">
            <Suspense fallback={<PageLoader />}><ShoppingList /></Suspense>
          </ModuleRoute>
        } />
        <Route path="health" element={
          <ModuleRoute module="health">
            <Suspense fallback={<PageLoader />}><HealthCenter /></Suspense>
          </ModuleRoute>
        } />
        <Route path="mural" element={
          <ModuleRoute module="mural">
            <Suspense fallback={<PageLoader />}><MuralBoard /></Suspense>
          </ModuleRoute>
        } />
        <Route path="reports" element={
          <ModuleRoute module="reports">
            <Suspense fallback={<PageLoader />}><ReportsPage /></Suspense>
          </ModuleRoute>
        } />
        <Route path="family" element={<Navigate to="/parent/family-administration" replace />} />
        <Route path="admin"  element={<Navigate to="/parent/family-administration" replace />} />
        <Route path="family-administration" element={
          <GestorRoute>
            <Suspense fallback={<PageLoader />}><FamilyAdministration /></Suspense>
          </GestorRoute>
        } />
        <Route path="billing" element={
          <GestorRoute>
            <Suspense fallback={<PageLoader />}><SubscribePage /></Suspense>
          </GestorRoute>
        } />
      </Route>

      {/* ── CHILD ──────────────────────────────────────────────────────── */}
      <Route path="/child" element={
        <ProtectedRoute allowedRoles={['child']}>
          <ChildLayout />
        </ProtectedRoute>
      }>
        <Route index element={
          <Suspense fallback={<PageLoader />}><ChildDashboard /></Suspense>
        } />
        <Route path="tasks" element={
          <ModuleRoute module="tasks">
            <Suspense fallback={<PageLoader />}><MyTasks /></Suspense>
          </ModuleRoute>
        } />
        <Route path="grades" element={
          <ModuleRoute module="grades">
            <Suspense fallback={<PageLoader />}><MyGrades /></Suspense>
          </ModuleRoute>
        } />
        <Route path="allowance" element={
          <ModuleRoute anyOf={['allowance', 'piggy_bank', 'goals']}>
            <Suspense fallback={<PageLoader />}><MyAllowance /></Suspense>
          </ModuleRoute>
        } />
        <Route path="family-shop" element={
          <ModuleRoute module="family_shop">
            <Suspense fallback={<PageLoader />}><MyFamilyShop /></Suspense>
          </ModuleRoute>
        } />
        <Route path="calendar" element={
          <ModuleRoute module="calendar">
            <Suspense fallback={<PageLoader />}><MyCalendar /></Suspense>
          </ModuleRoute>
        } />
        <Route path="shopping" element={
          <ModuleRoute module="shopping">
            <Suspense fallback={<PageLoader />}><ShoppingList /></Suspense>
          </ModuleRoute>
        } />
        <Route path="health" element={
          <ModuleRoute module="health">
            <Suspense fallback={<PageLoader />}><HealthCenter /></Suspense>
          </ModuleRoute>
        } />
        <Route path="mural" element={
          <ModuleRoute module="mural">
            <Suspense fallback={<PageLoader />}><MuralBoard /></Suspense>
          </ModuleRoute>
        } />
      </Route>

      {/* ── MASTER ─────────────────────────────────────────────────────── */}
      <Route path="/master" element={
        <ProtectedRoute allowedRoles={['master']}>
          <MasterLayout />
        </ProtectedRoute>
      }>
        <Route index element={
          <Suspense fallback={<PageLoader />}><MasterDashboard /></Suspense>
        } />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

/** Uma rotina por retorno à app: sessão/perfil primeiro; páginas reagem só ao evento único (`useAutoRefresh`). */
function AppResumeSync() {
  const { performControlledResume, loading } = useAuth();
  /** Depois do primeiro hydrate não bloqueamos: sessão existe mas `user` pode ainda actualizar um tick. */
  useAppResume({ onResume: performControlledResume, enabled: !loading });
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <LanguageProvider>
        <AuthProvider>
          <AppResumeSync />
          <PWAProvider>
            <ToastProvider>
              <FirstAccessPasswordModal />
              <PWAUpdateModal />
              <AppRoutes />
              <PWAInstallBanner />
            </ToastProvider>
          </PWAProvider>
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}
