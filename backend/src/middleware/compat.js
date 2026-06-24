export function compatMiddleware(req, res, next) {
  const tenantSlug = req.headers['x-tenant-slug'];

  if (!tenantSlug) {
    req.tenantId = 'restaurant-001';
    req.tenantSlug = 'restaurant-001';
    req.isLegacy = true;
  } else {
    req.tenantId = tenantSlug;
    req.tenantSlug = tenantSlug;
    req.isLegacy = false;
  }

  next();
}
