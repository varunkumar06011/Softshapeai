import { Navigate } from 'react-router-dom';

// ── AdminRouteGuard — Synchronous role + module gate ─────────────────────────
// Returns <Navigate replace /> during render if the role is not allowed or the
// module is not enabled. This prevents restricted content from mounting even
// for a single paint frame — critical for a POS system with financial data.

export default function AdminRouteGuard({
  allowedRoles,
  role,
  routeKey,
  enabledModules,
  isRouteEnabledFn,
  isManagerTabEnabledFn,
  basePath = '/admin/dashboard',
  children,
}) {
  const normalizedRole = role?.toLowerCase() || 'admin';

  // Role check — synchronous, before children render
  if (!allowedRoles.includes(normalizedRole)) {
    return <Navigate to={basePath} replace />;
  }

  // Module gating check — synchronous, before children render
  if (isRouteEnabledFn && !isRouteEnabledFn(routeKey, enabledModules)) {
    return <Navigate to={basePath} replace />;
  }

  // Manager tab visibility check — if the role is manager and a specific
  // tab toggle function is provided, ensure the tab is enabled for managers.
  // This prevents managers from accessing toggled-off tabs via direct URL.
  if (normalizedRole === 'manager' && isManagerTabEnabledFn && !isManagerTabEnabledFn(routeKey, enabledModules)) {
    return <Navigate to={basePath} replace />;
  }

  return children;
}
