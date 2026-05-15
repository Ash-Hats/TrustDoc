import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import AppLayout from "./layouts/AppLayout";
import PublicLayout from "./layouts/PublicLayout";
import RequireWallet from "./components/RequireWallet";
import ProtectedRoute from "./components/ProtectedRoute";
import PublicOnlyRoute from "./components/PublicOnlyRoute";
import Skeleton from "./components/ui/Skeleton";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const RegisterDocument = lazy(() => import("./pages/Register"));
const Verify = lazy(() => import("./pages/Verify"));
const DocumentInfo = lazy(() => import("./pages/DocumentInfo"));
const MyDocuments = lazy(() => import("./pages/MyDocuments"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Settings = lazy(() => import("./pages/Settings"));
const Profile = lazy(() => import("./pages/Profile"));
const Login = lazy(() => import("./pages/Login"));
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const SuperAdminLogin = lazy(() => import("./pages/SuperAdminLogin"));
const AuthRegister = lazy(() => import("./pages/AuthRegister"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const IdentitySetup = lazy(() => import("./pages/IdentitySetup"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const ApprovalQueue = lazy(() => import("./pages/ApprovalQueue"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const AuditLogs = lazy(() => import("./pages/AuditLogs"));
const SuperAdminDashboard = lazy(() => import("./pages/SuperAdminDashboard"));
const OrganizationManagement = lazy(() => import("./pages/OrganizationManagement"));

function PageFallback() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-52" />
      <Skeleton className="h-44 w-full" />
      <Skeleton className="h-44 w-full" />
    </div>
  );
}

function Guarded(element) {
  return <RequireWallet>{element}</RequireWallet>;
}

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route
            path="/login"
            element={
              <PublicOnlyRoute>
                <Login />
              </PublicOnlyRoute>
            }
          />
          <Route
            path="/admin/login"
            element={
              <PublicOnlyRoute>
                <AdminLogin />
              </PublicOnlyRoute>
            }
          />
          <Route
            path="/superadmin/login"
            element={
              <PublicOnlyRoute>
                <SuperAdminLogin />
              </PublicOnlyRoute>
            }
          />
          <Route
            path="/register"
            element={
              <PublicOnlyRoute>
                <AuthRegister />
              </PublicOnlyRoute>
            }
          />
          <Route
            path="/forgot-password"
            element={
              <PublicOnlyRoute>
                <ForgotPassword />
              </PublicOnlyRoute>
            }
          />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/setup/identity" element={<IdentitySetup />} />

          <Route
            path="/verify"
            element={
              <PublicLayout>
                <Verify />
              </PublicLayout>
            }
          />
          <Route
            path="/document/:hash"
            element={
              <PublicLayout>
                <DocumentInfo />
              </PublicLayout>
            }
          />

          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/register-document" element={Guarded(<RegisterDocument />)} />
            <Route path="/my-documents" element={Guarded(<MyDocuments />)} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>

          <Route
            element={
              <ProtectedRoute requiredPortal="admin" requireSetup={false}>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/approvals" element={<ApprovalQueue />} />
            <Route path="/admin/users" element={<UserManagement />} />
            <Route path="/admin/audit" element={<AuditLogs />} />
          </Route>

          <Route
            element={
              <ProtectedRoute requiredPortal="superadmin" requireSetup={false}>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/superadmin" element={<SuperAdminDashboard />} />
            <Route path="/superadmin/organizations" element={<OrganizationManagement />} />
          </Route>
        </Routes>
      </Suspense>

      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            borderRadius: "14px",
            border: "1px solid rgba(148, 163, 184, 0.3)",
            background: "rgba(26, 31, 46, 0.92)",
            color: "#e5e7eb",
            boxShadow: "0 18px 34px -18px rgba(15, 17, 23, 0.95)",
          },
        }}
      />
    </BrowserRouter>
  );
}

export default App;
