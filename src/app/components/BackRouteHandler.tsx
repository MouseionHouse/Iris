import { ReactNode, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getBackPath } from '../pages/mobileNav';

type BackRouteHandlerProps = {
  children: (onBack: () => void) => ReactNode;
};
export function BackRouteHandler({ children }: BackRouteHandlerProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const goBack = useCallback(() => {
    const backPath = getBackPath(location.pathname);
    if (backPath) navigate(backPath);
  }, [navigate, location]);

  return children(goBack);
}
