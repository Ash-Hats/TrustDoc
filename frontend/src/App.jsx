import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import AppLayout from "./layouts/AppLayout";
import RequireWallet from "./components/RequireWallet";
import ProtectedRoute from "./components/ProtectedRoute";
import PublicOnlyRoute from "./components/PublicOnlyRoute";
import Skeleton from "./components/ui/Skeleton";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const RegisterDocument = lazy(() => import("./pages/Register"));
const Verify = lazy(() => import("./pages/Verify"));
const MyDocuments = lazy(() => import("./pages/MyDocuments"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Settings = lazy(() => import("./pages/Settings"));
const Profile = lazy(() => import("./pages/Profile"));
const Login = lazy(() => import("./pages/Login"));
const AuthRegister = lazy(() => import("./pages/AuthRegister"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const IdentitySetup = lazy(() => import("./pages/IdentitySetup"));

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

          <Route element={<AppLayout />}>
            <Route path="/verify" element={<Verify />} />
          </Route>

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
