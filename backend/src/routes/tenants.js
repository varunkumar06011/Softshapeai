import { Router } from 'express';
import bcrypt from 'bcryptjs';

const router = Router();

router.post('/', async (req, res, next) => {
  try {
    const {
      name,
      slug,
      plan = 'basic',
      admin,
      captains = [],
      printers = []
    } = req.body;

    if (!name || !slug || !admin || !admin.email || !admin.password) {
      return res.status(400).json({
        error: 'Tenant name, slug, admin email and password are required'
      });
    }

    if (!/^[a-z0-9-]+$/.test(slug)) {
      return res.status(400).json({
        error: 'Slug must be lowercase letters, numbers, and hyphens only'
      });
    }

    const existing = await req.prisma.tenant.findUnique({ where: { slug } });
    if (existing) {
      return res.status(409).json({ error: 'Tenant slug already exists' });
    }

    const result = await req.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name, slug, plan, active: true }
      });

      const hashedPassword = await bcrypt.hash(admin.password, 10);
      const adminUser = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: admin.email.toLowerCase().trim(),
          name: admin.name || 'Admin',
          role: admin.role || 'admin',
          password: hashedPassword
        }
      });

      const createdCaptains = await Promise.all(
        captains.map(async (cap) => {
          const hashedPin = await bcrypt.hash(cap.pin, 10);
          return tx.captain.create({
            data: {
              tenantId: tenant.id,
              name: cap.name,
              pin: hashedPin,
              initials: cap.initials || cap.name.charAt(0).toUpperCase(),
              color: cap.color || '#E53935'
            }
          });
        })
      );

      const createdPrinters = await Promise.all(
        printers.map(async (printer) => {
          return tx.printerConfig.create({
            data: {
              tenantId: tenant.id,
              name: printer.name,
              ipAddress: printer.ipAddress,
              port: printer.port || 9100,
              type: printer.type || 'KOT',
              paperWidth: printer.paperWidth || 80
            }
          });
        })
      );

      return { tenant, adminUser, captains: createdCaptains, printers: createdPrinters };
    });

    const safeResponse = {
      ...result,
      adminUser: {
        id: result.adminUser.id,
        email: result.adminUser.email,
        name: result.adminUser.name,
        role: result.adminUser.role,
        tenantId: result.adminUser.tenantId
      }
    };

    res.status(201).json({
      success: true,
      tenant: safeResponse
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:slug', async (req, res, next) => {
  try {
    const { slug } = req.params;

    const tenant = await req.prisma.tenant.findUnique({
      where: { slug },
      include: {
        captains: { where: { active: true } },
        printers: { where: { active: true } },
        menuItems: { where: { active: true } }
      }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const safeTenant = {
      ...tenant,
      captains: tenant.captains.map(c => ({
        id: c.id,
        name: c.name,
        initials: c.initials,
        color: c.color,
        active: c.active
      }))
    };

    res.json({ success: true, tenant: safeTenant });
  } catch (err) {
    next(err);
  }
});

export default router;
