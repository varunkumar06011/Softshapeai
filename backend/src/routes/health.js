import { Router } from 'express';

const router = Router();

router.get('/', async (req, res) => {
  try {
    await req.prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'ok',
      tenantId: req.tenantId,
      isLegacy: req.isLegacy,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(503).json({
      status: 'degraded',
      database: false,
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

export default router;
