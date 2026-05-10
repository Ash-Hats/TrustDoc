import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Card from "./ui/Card";

export default function PublicOnlyRoute({ children }) {
  const [searchParams] = useSearchParams();
  const { isAuthenticated, isAuthLoading } = useAuth();

  if (isAuthLoading) {
    return (
      <Card className="mx-auto mt-10 w-full max-w-lg">
        <h2 className="text-xl font-semibold text-gray-100">Preparing Secure Session</h2>
        <p className="mt-2 text-sm text-gray-400">Checking account state...</p>
      </Card>
    );
  }

  if (isAuthenticated) {
    const next = searchParams.get("next");
    return <Navigate to={next || "/dashboard"} replace />;
  }

  return children;
}
