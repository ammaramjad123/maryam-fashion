import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// Gates its children behind authentication. Waits for the initial /auth/me
// check so a valid, stored token is not treated as logged-out on reload.
export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return children;
}
