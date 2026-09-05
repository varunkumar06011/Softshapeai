function requirePluginMethod(plugin, method) {
  if (!plugin || typeof plugin[method] !== 'function') {
    throw new Error(`Android printer plugin does not implement ${method}()`);
  }
}

function toBytes(bytes) {
  if (bytes instanceof Uint8Array) return Array.from(bytes);
  if (Array.isArray(bytes)) return bytes.map((value) => Number(value) & 0xff);
  throw new TypeError('Print data must be a byte array');
}

export function createAndroidPrinterAdapter(plugin) {
  return {
    async print({ connection = {}, bytes } = {}) {
      const payload = toBytes(bytes);
      if (payload.length === 0) throw new Error('No print data');

      if (connection.type === 'usb') {
        const deviceName = String(connection.deviceName || '').trim();
        if (!deviceName) throw new Error('USB printer deviceName is required');
        requirePluginMethod(plugin, 'printRaw');
        return plugin.printRaw({ deviceName, printerName: deviceName, bytes: payload });
      }

      const ip = String(connection.ip || '').trim();
      if (!ip) throw new Error('LAN printer IP is required');
      const port = Number(connection.port || 9100);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('LAN printer port must be between 1 and 65535');
      }
      requirePluginMethod(plugin, 'printNetwork');
      return plugin.printNetwork({ ip, port, bytes: payload });
    },

    async probeNetwork(connection = {}) {
      const ip = String(connection.ip || '').trim();
      const port = Number(connection.port || 9100);
      if (!ip) throw new Error('LAN printer IP is required');
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('LAN printer port must be between 1 and 65535');
      requirePluginMethod(plugin, 'probeNetwork');
      return plugin.probeNetwork({ ip, port });
    },

    async discoverNetwork(candidates = [], { concurrency = 8, port = 9100 } = {}) {
      if (!Array.isArray(candidates)) throw new TypeError('Network printer candidates must be an array');
      const uniqueIps = [...new Set(candidates.map((ip) => String(ip || '').trim()).filter(Boolean))];
      const found = [];
      let nextIndex = 0;
      const worker = async () => {
        while (nextIndex < uniqueIps.length) {
          const ip = uniqueIps[nextIndex++];
          try {
            const result = await this.probeNetwork({ ip, port });
            if (result?.reachable) found.push({ type: 'lan', ip, port });
          } catch { /* unreachable candidate */ }
        }
      };
      await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), 16) }, worker));
      return found;
    },

    async listUsbPrinters() {
      requirePluginMethod(plugin, 'listPrinters');
      const result = await plugin.listPrinters();
      return Array.isArray(result?.printers) ? result.printers : [];
    },

    async requestUsbPermission(deviceName) {
      const normalized = String(deviceName || '').trim();
      if (!normalized) throw new Error('USB printer deviceName is required');
      requirePluginMethod(plugin, 'requestUsbPermission');
      return plugin.requestUsbPermission({ deviceName: normalized });
    },

    health() {
      return { platform: 'android', transports: ['lan', 'usb'] };
    },
  };
}

export function encodeEscposBlocks(blocks = []) {
  if (!Array.isArray(blocks)) throw new TypeError('ESC/POS blocks must be an array');
  const text = blocks.map((block) => String(block?.data ?? '')).join('');
  return Array.from(new TextEncoder().encode(text));
}
