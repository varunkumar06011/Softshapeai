// ─────────────────────────────────────────────────────────────────────────────
// edgeReadiness — is this PC's runtime ready for staff to log in?
// ─────────────────────────────────────────────────────────────────────────────
// One rule for every gate. The setup screen used to call a PC "ready" as soon as
// the config sync finished, while the cashier login only let staff in when the
// PC also held at least one menu item — an outlet whose menu was empty (or not
// yet loaded) bounced between "Continue to cashier" and the setup screen for
// ever. Both now use this rule, and the setup screen says why when it is not met.
//
// `status` is the body of the runtime's GET /api/edge/status.
// ─────────────────────────────────────────────────────────────────────────────

export function edgeNotReadyReason(status) {
  if (!status?.registered) {
    return 'This PC is not linked to a restaurant yet. Go back and link it with a setup token.';
  }
  if (!status.sessionValid) {
    return 'This PC’s link to the cloud has expired. Go back and link it again with a fresh setup token.';
  }
  const menuItems = status.localStats?.menuItems || 0;
  if (menuItems === 0 && status.configSyncCompleted !== true) {
    return 'The menu has not been loaded onto this PC yet. Go back and run the sync again.';
  }
  return null;
}

/**
 * Registered, linked with a valid session, and the config download has finished.
 * An outlet that has no menu items yet (a new outlet) is still ready — staff can
 * log in and the menu is added from the admin.
 */
export function isEdgeReady(status) {
  return edgeNotReadyReason(status) === null;
}
