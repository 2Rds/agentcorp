import { useClerkAuth } from '@/contexts/ClerkAuthContext';
import { Navigate, useLocation } from 'react-router-dom';

interface ClerkProtectedRouteProps {
  children: React.ReactNode;
}

export const ClerkProtectedRoute = ({ children }: ClerkProtectedRouteProps) => {
  const { isLoaded, isSignedIn } = useClerkAuth();
  const location = useLocation();

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isSignedIn) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};
