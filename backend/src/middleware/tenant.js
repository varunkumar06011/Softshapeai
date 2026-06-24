export async function requireTenant(req, res, next) {
  try {
    if (req.isLegacy) {
      return next();
    }

    if (!req.tenantSlug) {
      return res.status(400).json({ error: 'Missing tenant slug' });
    }

    const tenant = await req.prisma.tenant.findUnique({
      where: { slug: req.tenantSlug }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    if (!tenant.active) {
      return res.status(403).json({ error: 'Tenant is suspended or inactive' });
    }

    req.tenantId = tenant.id;
    req.tenant = tenant;

    next();
  } catch (err) {
    next(err);
  }
}
