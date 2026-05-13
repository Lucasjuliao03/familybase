import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { moduleAllowed, anyModuleAllowed } from './lib/familyModules';
import { LanguageProvider } from './contexts/LanguageContext';
import { ToastProvider } from './contexts/ToastContext';
import { PWAProvider } from './contexts/PWAContext';
import PWAInstallBanner from './components/PWAInstallBanner';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import ParentLayout from './components/layout/ParentLayout';
import ChildLayout from './components/layout/ChildLayout';
import MasterLayout from './components/layout/MasterLayout';
import ParentDashboard from './pages/parent/ParentDashboard';
import TaskManager from './pages/parent/TaskManager';
import GradeTracker from './pages/parent/GradeTracker';
import AllowanceManager from './pages/parent/AllowanceManager';
import FamilyShopManager from './pages/parent/FamilyShopManager';
import CalendarPage from './pages/parent/CalendarPage';
import ReportsPage from './pages/parent/ReportsPage';
import FamilyAdministration from './pages/parent/FamilyAdministration';
import FirstAccessPasswordModal from './components/FirstAccessPasswordModal';
import ShoppingList from './pages/parent/ShoppingList';
import HealthCenter from './pages/HealthCenter';
import MuralBoard from './pages/MuralBoard';
import ChildDashboard from './pages/child/ChildDashboard';
import MyTasks from './pages/child/MyTasks';
import MyGrades from './pages/child/MyGrades';
import MyAllowance from './pages/child/MyAllowance';
import MyFamilyShop from './pages/child/MyFamilyShop';
import MyCalendar from './pages/child/MyCalendar';
import MasterDashboard from './pages/master/MasterDashboard';

function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex-center" style={{ minHeight: '100vh' }}><div className="animate-bounce-in" style={{ fontSize: '3rem' }}>🏠</div></div>;
  if (!user) return <Navigate to="/login" />;
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    if (user.role === 'master') return <Navigate to="/master" />;
    if (user.role === 'child') return <Navigate to="/child" />;
    return <Navigate to="/parent" />;
  }
  return children;
}

/** Apenas pai/gestor (perfil gestor), não parente nem responsável auxiliar */
function GestorRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex-center" style={{ minHeight: '100vh' }}><div className="animate-bounce-in" style={{ fontSize: '3rem' }}>🏠</div></div>;
  if (!user) return <Navigate to="/login" />;
  if (user.role !== 'parent') return <Navigate to="/parent" />;
  const ap = user.access_profile ?? user.accessProfile ?? 'gestor';
  if (ap !== 'gestor') return <Navigate to="/parent" />;
  return children;
}

/** Bloqueia rota se o módulo não estiver ativo para a família (além das permissões no backend). */
function ModuleRoute({ module: moduleKey, anyOf, children }) {
  const { user, modules, loading } = useAuth();
  const base = user?.role === 'child' ? '/child' : '/parent';
  if (loading) return <div className="flex-center" style={{ minHeight: '100vh' }}><div className="animate-bounce-in" style={{ fontSize: '3rem' }}>🏠</div></div>;
  if (anyOf?.length) {
    if (!anyModuleAllowed(modules, anyOf)) return <Navigate to={base} replace />;
  } else if (moduleKey && !moduleAllowed(modules, moduleKey)) {
    return <Navigate to={base} replace />;
  }
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex-center" style={{ minHeight: '100vh' }}><div className="animate-bounce-in" style={{ fontSize: '3rem' }}>🏠</div></div>;

  const getDefaultPath = () => {
    if (!user) return '/login';
    if (user.role === 'master') return '/master';
    if (user.role === 'child') return '/child';
    return '/parent';
  };

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={getDefaultPath()} /> : <LoginPage />} />
      <Route path="/register" element={user ? <Navigate to="/parent" /> : <RegisterPage />} />

      {/* PARENT & RELATIVE ROUTES */}
      <Route path="/parent" element={<ProtectedRoute allowedRoles={['parent', 'relative']}><ParentLayout /></ProtectedRoute>}>
        <Route index element={<ParentDashboard />} />
        <Route path="tasks" element={<ModuleRoute module="tasks"><TaskManager /></ModuleRoute>} />
        <Route path="grades" element={<ModuleRoute module="grades"><GradeTracker /></ModuleRoute>} />
        <Route path="allowance" element={<ModuleRoute anyOf={['allowance', 'piggy_bank', 'goals']}><AllowanceManager /></ModuleRoute>} />
        <Route path="family-shop" element={<ModuleRoute module="family_shop"><FamilyShopManager /></ModuleRoute>} />
        <Route path="calendar" element={<ModuleRoute module="calendar"><CalendarPage /></ModuleRoute>} />
        <Route path="shopping" element={<ModuleRoute module="shopping"><ShoppingList /></ModuleRoute>} />
        <Route path="health" element={<ModuleRoute module="health"><HealthCenter /></ModuleRoute>} />
        <Route path="mural" element={<ModuleRoute module="mural"><MuralBoard /></ModuleRoute>} />
        <Route path="reports" element={<ModuleRoute module="reports"><ReportsPage /></ModuleRoute>} />
        <Route path="family" element={<Navigate to="/parent/family-administration" replace />} />
        <Route path="admin" element={<Navigate to="/parent/family-administration" replace />} />
        <Route path="family-administration" element={<GestorRoute><FamilyAdministration /></GestorRoute>} />
      </Route>

      {/* CHILD ROUTES */}
      <Route path="/child" element={<ProtectedRoute allowedRoles={['child']}><ChildLayout /></ProtectedRoute>}>
        <Route index element={<ChildDashboard />} />
        <Route path="tasks" element={<ModuleRoute module="tasks"><MyTasks /></ModuleRoute>} />
        <Route path="grades" element={<ModuleRoute module="grades"><MyGrades /></ModuleRoute>} />
        <Route path="allowance" element={<ModuleRoute anyOf={['allowance', 'piggy_bank', 'goals']}><MyAllowance /></ModuleRoute>} />
        <Route path="family-shop" element={<ModuleRoute module="family_shop"><MyFamilyShop /></ModuleRoute>} />
        <Route path="calendar" element={<ModuleRoute module="calendar"><MyCalendar /></ModuleRoute>} />
        <Route path="shopping" element={<ModuleRoute module="shopping"><ShoppingList /></ModuleRoute>} />
        <Route path="health" element={<ModuleRoute module="health"><HealthCenter /></ModuleRoute>} />
        <Route path="mural" element={<ModuleRoute module="mural"><MuralBoard /></ModuleRoute>} />
      </Route>

      {/* MASTER ROUTES */}
      <Route path="/master" element={<ProtectedRoute allowedRoles={['master']}><MasterLayout /></ProtectedRoute>}>
        <Route index element={<MasterDashboard />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <LanguageProvider>
        <AuthProvider>
          <PWAProvider>
            <ToastProvider>
              <FirstAccessPasswordModal />
              <AppRoutes />
              <PWAInstallBanner />
            </ToastProvider>
          </PWAProvider>
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}
