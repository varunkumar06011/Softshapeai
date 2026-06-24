import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '7d';

function generateToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const tenantId = req.tenantId;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await req.prisma.user.findFirst({
      where: { email, tenantId }
    });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId
      }
    });
  } catch (err) {
    next(err);
  }
});

router.post('/captain-login', async (req, res, next) => {
  try {
    const { captainId, pin } = req.body;
    const tenantId = req.tenantId;

    if (!captainId || !pin) {
      return res.status(400).json({ error: 'Captain ID and PIN are required' });
    }

    const captain = await req.prisma.captain.findFirst({
      where: { id: captainId, tenantId, active: true }
    });

    if (!captain || !(await bcrypt.compare(pin, captain.pin))) {
      return res.status(401).json({ error: 'Invalid captain credentials' });
    }

    const token = jwt.sign(
      { captainId: captain.id, tenantId: captain.tenantId, role: 'captain', name: captain.name },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    res.json({
      success: true,
      token,
      captain: {
        id: captain.id,
        name: captain.name,
        initials: captain.initials,
        color: captain.color,
        tenantId: captain.tenantId
      }
    });
  } catch (err) {
    next(err);
  }
});

router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;
    const tenantId = req.tenantId;

    const user = await req.prisma.user.findFirst({
      where: { email, tenantId }
    });

    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      await req.prisma.user.update({
        where: { id: user.id },
        data: {
          resetToken: token,
          resetExpires: new Date(Date.now() + 15 * 60 * 1000)
        }
      });

      console.log(`[Password Reset] Tenant: ${tenantId}, Email: ${email}, Token: ${token}`);
    }

    res.json({ message: 'If this email exists, a reset link has been sent.' });
  } catch (err) {
    next(err);
  }
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;

    const user = await req.prisma.user.findFirst({
      where: {
        resetToken: token,
        resetExpires: { gt: new Date() }
      }
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    await req.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashed,
        resetToken: null,
        resetExpires: null
      }
    });

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    next(err);
  }
});

export default router;
