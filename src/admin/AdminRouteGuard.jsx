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
  redirectTo = '/admin/dashboard/tables',
  children,
}) {
  const normalizedRole = role?.toLowerCase() || 'admin';

  // Role check — synchronous, before children render
  if (!allowedRoles.includes(normalizedRole)) {
    return <Navigate to={redirectTo} replace />;
  }

  // Module gating check — synchronous, before children render
  if (isRouteEnabledFn && !isRouteEnabledFn(routeKey, enabledModules)) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return children;
}
