import { Router } from 'express';
import bcrypt from 'bcryptjs';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const tenantId = req.tenantId;
    const captains = await req.prisma.captain.findMany({
      where: { tenantId, active: true },
      select: { id: true, name: true, initials: true, color: true, active: true, createdAt: true }
    });
    res.json({ success: true, captains });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const tenantId = req.tenantId;
    const { name, pin, initials, color } = req.body;

    if (!name || !pin) {
      return res.status(400).json({ error: 'Name and PIN are required' });
    }

    const hashedPin = await bcrypt.hash(pin, 10);

    const captain = await req.prisma.captain.create({
      data: {
        tenantId,
        name,
        pin: hashedPin,
        initials: initials || name.charAt(0).toUpperCase(),
        color: color || '#E53935'
      }
    });

    res.status(201).json({
      success: true,
      captain: {
        id: captain.id,
        name: captain.name,
        initials: captain.initials,
        color: captain.color,
        pin: pin
      }
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/reset-pin', async (req, res, next) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;
    const { newPin } = req.body;

    const pin = newPin || Math.floor(1000 + Math.random() * 9000).toString();
    const hashedPin = await bcrypt.hash(pin, 10);

    const captain = await req.prisma.captain.update({
      where: { id, tenantId },
      data: { pin: hashedPin }
    });

    res.json({
      success: true,
      captain: {
        id: captain.id,
        name: captain.name,
        newPin: pin
      }
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;

    await req.prisma.captain.update({
      where: { id, tenantId },
      data: { active: false }
    });

    res.json({ success: true, message: 'Captain deactivated' });
  } catch (err) {
    next(err);
  }
});

export default router;
