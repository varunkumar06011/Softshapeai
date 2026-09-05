import { describe, expect, it, vi } from 'vitest';
import { createAndroidPrinterAdapter, encodeEscposBlocks } from '../printer';

describe('Android printer adapter', () => {
  it('prints ESC/POS bytes to a LAN printer with the configured port', async () => {
    const plugin = { printNetwork: vi.fn(async () => ({ success: true })) };
    const printer = createAndroidPrinterAdapter(plugin);

    await printer.print({
      connection: { type: 'lan', ip: '192.168.1.50', port: 9100 },
      bytes: new Uint8Array([0x1b, 0x40, 0x0a]),
    });

    expect(plugin.printNetwork).toHaveBeenCalledWith({
      ip: '192.168.1.50',
      port: 9100,
      bytes: [27, 64, 10],
    });
  });

  it('routes USB jobs to the native raw printer method', async () => {
    const plugin = { printRaw: vi.fn(async () => ({ success: true })) };
    const printer = createAndroidPrinterAdapter(plugin);

    await printer.print({
      connection: { type: 'usb', deviceName: '/dev/bus/usb/001/002' },
      bytes: [65, 66],
    });

    expect(plugin.printRaw).toHaveBeenCalledWith({
      deviceName: '/dev/bus/usb/001/002',
      printerName: '/dev/bus/usb/001/002',
      bytes: [65, 66],
    });
  });

  it('rejects invalid printer configuration before invoking native code', async () => {
    const plugin = { printNetwork: vi.fn() };
    const printer = createAndroidPrinterAdapter(plugin);

    await expect(printer.print({ connection: { type: 'lan', ip: '' }, bytes: [1] }))
      .rejects.toThrow('LAN printer IP is required');
    await expect(printer.print({ connection: { type: 'lan', ip: '127.0.0.1', port: 70000 }, bytes: [1] }))
      .rejects.toThrow('port must be between');
    expect(plugin.printNetwork).not.toHaveBeenCalled();
  });

  it('encodes renderer blocks into bytes for the native bridge', () => {
    expect(encodeEscposBlocks([{ data: 'KOT\n' }, { data: 'Table 4\n' }]))
      .toEqual(Array.from(new TextEncoder().encode('KOT\nTable 4\n')));
  });
});
