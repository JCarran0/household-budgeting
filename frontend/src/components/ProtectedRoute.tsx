import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export const PENDING_SHARE_KEY = 'pending_share_id';

export function ProtectedRoute() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const location = useLocation();

  if (!isAuthenticated) {
    // Preserve a pending Web Share Target hand-off across the login bounce.
    // Without this, the ?share=<id> query param is dropped by the redirect
    // and the cached file is orphaned in Cache Storage.
    const params = new URLSearchParams(location.search);
    const shareId = params.get('share');
    if (shareId) {
      sessionStorage.setItem(PENDING_SHARE_KEY, shareId);
    }
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}