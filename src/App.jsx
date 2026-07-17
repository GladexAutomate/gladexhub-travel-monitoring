import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate, Outlet, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { useAuth as useFlightTrackerAuth } from '@/hooks/useAuth';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import CustomerPortal from '@/pages/CustomerPortal';
import AdminFlightManagement from '@/pages/AdminFlightManagement';
import EmployeeAccounts from '@/pages/EmployeeAccounts';
import FlightTrackerLogin from '@/pages/FlightTrackerLogin';
import SystemDiagnostics from '@/pages/SystemDiagnostics';

// Separate auth system from the base44 useAuth above — flight-tracker RBAC
// is backed by the employeeaccount table (see src/hooks/useAuth.js), not
// base44.
function FlightTrackerAuthGuard() {
  const { isAuthenticated } = useFlightTrackerAuth();
  if (!isAuthenticated) {
    return <Navigate to="/admin/flight-tracker-login" replace />;
  }
  return <Outlet />;
}

const FLIGHT_TRACKER_PREFIX = '/admin';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();
  const location = useLocation();
  const isFlightTrackerRoute = location.pathname.startsWith(FLIGHT_TRACKER_PREFIX);

  // Flight Tracker/Accounts pages use their own login (employeeaccount table,
  // see FlightTrackerAuthGuard above) and must not be blocked by base44's
  // platform-level auth gate below — skip straight to the route table.
  if (!isFlightTrackerRoute && (isLoadingPublicSettings || isLoadingAuth)) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-orange-200 border-t-orange-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isFlightTrackerRoute && authError) {
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

      {/* Auth routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/diagnostics" element={<SystemDiagnostics />} />

      {/* Flight Tracker — own login/RBAC (employeeaccount table), separate
          from base44 auth above. /admin redirects here now that the old
          base44-native dashboard is gone. */}
      <Route path="/admin" element={<Navigate to="/admin/flight-tracker" replace />} />
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