import { Router } from 'express';

const router = Router();

router.post('/repair', async (req, res, next) => {
  try {
    const { superAdminKey, tenantId, action, targetId, payload } = req.body;

    if (superAdminKey !== process.env.SUPER_ADMIN_KEY) {
      return res.status(403).json({ error: 'Unauthorized super-admin action' });
    }

    if (!tenantId || !action) {
      return res.status(400).json({ error: 'tenantId and action are required' });
    }

    let result;

    switch (action) {
      case 'reset-table':
        result = await req.prisma.table.update({
          where: { id: targetId, tenantId },
          data: {
            status: 'AVAILABLE',
            currentBill: 0,
            captainId: null
          }
        });
        break;

      case 'clear-active-order':
        result = await req.prisma.order.update({
          where: { id: targetId, tenantId },
          data: { status: payload?.status || 'COMPLETED' }
        });
        break;

      case 'reset-captain-password':
        result = await req.prisma.captain.update({
          where: { id: targetId, tenantId },
          data: { pin: payload?.newPin || '1234' }
        });
        break;

      case 'set-tenant-maintenance':
        result = await req.prisma.tenant.update({
          where: { id: tenantId },
          data: { active: payload?.active !== false }
        });
        break;

      default:
        return res.status(400).json({ error: 'Unknown repair action' });
    }

    res.json({
      success: true,
      action,
      tenantId,
      targetId,
      result
    });
  } catch (err) {
    next(err);
  }
});

export default router;
