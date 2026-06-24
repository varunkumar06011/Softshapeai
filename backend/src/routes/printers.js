import { Router } from 'express';
import net from 'net';

const router = Router();

function buildEscPosTestReceipt(tenantName, printerName) {
  const encoder = new TextEncoder();
  const lines = [
    '\n',
    '********************************\n',
    '     PRINTER TEST SUCCESSFUL\n',
    '********************************\n',
    `Tenant: ${tenantName || 'Test'}\n`,
    `Printer: ${printerName || 'Unknown'}\n`,
    `Time: ${new Date().toLocaleString()}\n`,
    '\n',
    'If this prints, your printer\n',
    'is connected correctly.\n',
    '\n',
    '\n',
    '\x1d\x56\x00'
  ];

  const bytes = lines.flatMap(line => Array.from(encoder.encode(line)));
  return new Uint8Array(bytes);
}

function sendToPrinter(ip, port, commands) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let timeout;

    socket.connect(port || 9100, ip, () => {
      socket.write(Buffer.from(commands));
      socket.end();
      clearTimeout(timeout);
      resolve({ success: true });
    });

    socket.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error('Printer connection timeout'));
    }, 5000);
  });
}

router.get('/', async (req, res, next) => {
  try {
    const tenantId = req.tenantId;
    const printers = await req.prisma.printerConfig.findMany({
      where: { tenantId, active: true }
    });
    res.json({ success: true, printers });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const tenantId = req.tenantId;
    const { name, ipAddress, port, type, paperWidth } = req.body;

    if (!name || !ipAddress) {
      return res.status(400).json({ error: 'Printer name and IP are required' });
    }

    const printer = await req.prisma.printerConfig.create({
      data: {
        tenantId,
        name,
        ipAddress,
        port: port || 9100,
        type: type || 'KOT',
        paperWidth: paperWidth || 80
      }
    });

    res.status(201).json({ success: true, printer });
  } catch (err) {
    next(err);
  }
});

router.post('/test', async (req, res, next) => {
  try {
    const { ipAddress, port, name } = req.body;

    if (!ipAddress) {
      return res.status(400).json({ error: 'Printer IP is required' });
    }

    const tenant = await req.prisma.tenant.findUnique({
      where: { id: req.tenantId }
    });

    const commands = buildEscPosTestReceipt(tenant?.name, name);

    await sendToPrinter(ipAddress, port, commands);

    res.json({ success: true, message: 'Test print sent successfully' });
  } catch (err) {
    res.status(503).json({
      success: false,
      error: err.message,
      suggestions: [
        'Check if printer is powered on',
        'Verify IP address is correct',
        'Ensure printer is on the same network as the server',
        'Check firewall allows port 9100'
      ]
    });
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;

    await req.prisma.printerConfig.update({
      where: { id, tenantId },
      data: { active: false }
    });

    res.json({ success: true, message: 'Printer deactivated' });
  } catch (err) {
    next(err);
  }
});

export default router;
