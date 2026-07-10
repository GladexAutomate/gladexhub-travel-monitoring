import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate, Outlet } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { useAuth as useFlightTrackerAuth } from '@/hooks/useAuth';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ProtectedRoute from '@/components/ProtectedRoute';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import CustomerPortal from '@/pages/CustomerPortal';
import AdminLayout from '@/components/admin/AdminLayout';
import Dashboard from '@/pages/admin/Dashboard';
import Bookings from '@/pages/admin/Bookings';
import EmailUpdates from '@/pages/admin/EmailUpdates';
import TimelineManager from '@/pages/admin/TimelineManager';
import AdminSettings from '@/pages/admin/AdminSettings';
import DataSourceMapping from '@/pages/admin/DataSourceMapping';
import RawData from '@/pages/admin/RawData';
import AdminFlightManagement from '@/pages/AdminFlightManagement';
import EmployeeAccounts from '@/pages/EmployeeAccounts';
import FlightTrackerLogin from '@/pages/FlightTrackerLogin';
import SystemDiagnostics from '@/pages/SystemDiagnostics';

// Separate auth system from the base44 useAuth above — flight-tracker RBAC
// is backed by the employeeaccount table (see src/hooks/useAuth.js), not
// base44. Gates /admin/flight-tracker independently of the base44
// ProtectedRoute block.
function FlightTrackerAuthGuard() {
  const { isAuthenticated } = useFlightTrackerAuth();
  if (!isAuthenticated) {
    return <Navigate to="/admin/flight-tracker-login" replace />;
  }
  return <Outlet />;
}

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-orange-200 border-t-orange-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      {/* Public customer portal */}
      <Route path="/" element={<CustomerPortal />} />

      {/* System diagnostics — connection tester */}
      <Route path="/diagnostics" element={<SystemDiagnostics />} />

      {/* Auth routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Protected admin routes */}
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<Dashboard />} />
          <Route path="/admin/bookings" element={<Bookings />} />
          <Route path="/admin/emails" element={<EmailUpdates />} />
          <Route path="/admin/timeline" element={<TimelineManager />} />
          <Route path="/admin/settings" element={<AdminSettings />} />
          <Route path="/admin/datasource" element={<DataSourceMapping />} />
          <Route path="/admin/raw-data" element={<RawData />} />
        </Route>
      </Route>

      {/* Flight Tracker — own login/RBAC (employeeaccount table), separate
          from base44's ProtectedRoute above. */}
      <Route path="/admin/flight-tracker-login" element={<FlightTrackerLogin />} />
      <Route element={<FlightTrackerAuthGuard />}>
        <Route path="/admin/flight-tracker" element={<AdminFlightManagement />} />
        {/* Developer-only — EmployeeAccounts itself redirects non-developers
            back to /admin/flight-tracker; this guard only checks login. */}
        <Route path="/admin/accounts" element={<EmployeeAccounts />} />
      </Route>

      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App