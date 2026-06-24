import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';

import { PrismaClient } from '@prisma/client';
import { compatMiddleware } from './middleware/compat.js';
import { errorHandler } from './middleware/errorHandler.js';

import authRoutes from './routes/auth.js';
import tenantRoutes from './routes/tenants.js';
import captainRoutes from './routes/captains.js';
import printerRoutes from './routes/printers.js';
import menuRoutes from './routes/menu.js';
import adminRoutes from './routes/admin.js';
import healthRoutes from './routes/health.js';

dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST']
  }
});

export const prisma = new PrismaClient();

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

app.use('/api', compatMiddleware);

app.use((req, res, next) => {
  req.io = io;
  req.prisma = prisma;
  next();
});

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/captains', captainRoutes);
app.use('/api/printers', printerRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/admin', adminRoutes);

io.on('connection', (socket) => {
  console.log('[Socket] Client connected:', socket.id);

  socket.on('join', (room) => {
    if (room) {
      socket.join(room);
      console.log('[Socket] Joined room:', room);
    }
  });

  socket.on('leave', (room) => {
    if (room) {
      socket.leave(room);
      console.log('[Socket] Left room:', room);
    }
  });

  socket.on('disconnect', () => {
    console.log('[Socket] Client disconnected:', socket.id);
  });
});

app.use(errorHandler);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`[Backend] Server running on port ${PORT}`);
  console.log(`[Backend] Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`[Backend] Frontend allowed: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
});

export { io };
