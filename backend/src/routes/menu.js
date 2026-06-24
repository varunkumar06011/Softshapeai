import { Router } from 'express';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const tenantId = req.tenantId;
    const menuItems = await req.prisma.menuItem.findMany({
      where: { tenantId, active: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }]
    });
    res.json({ success: true, menuItems });
  } catch (err) {
    next(err);
  }
});

router.post('/bulk-import', async (req, res, next) => {
  try {
    const tenantId = req.tenantId;
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items array is required' });
    }

    const validItems = items
      .filter(item => item.name && item.price)
      .map(item => ({
        tenantId,
        name: item.name,
        price: parseFloat(item.price),
        category: item.category || 'General',
        dietType: item.dietType || 'Non-Veg',
        menuType: item.menuType === 'LIQUOR' ? 'LIQUOR' : 'FOOD',
        printerTarget: item.printerTarget || (item.menuType === 'LIQUOR' ? 'BAR' : 'KITCHEN'),
        description: item.description || null,
        active: true
      }));

    if (validItems.length === 0) {
      return res.status(400).json({ error: 'No valid items to import' });
    }

    const created = await req.prisma.menuItem.createMany({
      data: validItems,
      skipDuplicates: true
    });

    req.io?.to(`tenant:${tenantId}:menu`).emit('menu:updated', { tenantId });

    res.status(201).json({
      success: true,
      importedCount: created.count,
      totalSubmitted: items.length
    });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const tenantId = req.tenantId;
    const item = req.body;

    const menuItem = await req.prisma.menuItem.create({
      data: {
        tenantId,
        name: item.name,
        price: parseFloat(item.price),
        category: item.category || 'General',
        dietType: item.dietType || 'Non-Veg',
        menuType: item.menuType === 'LIQUOR' ? 'LIQUOR' : 'FOOD',
        printerTarget: item.printerTarget || 'KITCHEN',
        description: item.description || null,
        active: true
      }
    });

    req.io?.to(`tenant:${tenantId}:menu`).emit('menu:updated', { tenantId });

    res.status(201).json({ success: true, menuItem });
  } catch (err) {
    next(err);
  }
});

export default router;
