package ai.softshape.cashier;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbEndpoint;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * ESC/POS Print Plugin for Cashier Android.
 *
 * Supports LAN TCP/IP printing and USB host printing. Bluetooth remains a
 * separate follow-up because it requires a different printer transport.
 */
@CapacitorPlugin(name = "EscposPrint")
public class EscposPrintPlugin extends Plugin {
    private static final String ACTION_USB_PERMISSION = "ai.softshape.cashier.USB_PERMISSION";
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Map<String, PendingUsbPrint> pendingUsbPrints = new HashMap<>();
    private UsbManager usbManager;
    private BroadcastReceiver usbReceiver;
    private boolean receiverRegistered;

    @PluginMethod
    public void printRaw(PluginCall call) {
        String deviceName = call.getString("deviceName", call.getString("printerName", ""));
        byte[] bytes = jsArrayToBytes(call.getArray("bytes", new JSArray()));
        if (deviceName.isEmpty()) {
            call.reject("USB deviceName is required");
            return;
        }
        if (bytes.length == 0) {
            call.reject("No print data");
            return;
        }

        executor.execute(() -> {
            try {
                ensureUsbManager();
                UsbDevice device = findUsbDevice(deviceName);
                if (device == null) {
                    call.reject("USB printer not found: " + deviceName);
                    return;
                }
                if (!usbManager.hasPermission(device)) {
                    registerUsbReceiver();
                    synchronized (pendingUsbPrints) {
                        pendingUsbPrints.put(device.getDeviceName(), new PendingUsbPrint(call, bytes));
                    }
                    requestUsbPermission(device);
                    return;
                }
                sendUsb(device, bytes, call);
            } catch (Exception error) {
                call.reject("USB print failed: " + error.getMessage());
            }
        });
    }

    @PluginMethod
    public void printNetwork(PluginCall call) {
        String ip = call.getString("ip", "");
        Integer port = call.getInt("port", 9100);
        byte[] bytes = jsArrayToBytes(call.getArray("bytes", new JSArray()));

        if (ip.isEmpty()) {
            call.reject("Printer IP is required");
            return;
        }
        if (bytes.length == 0) {
            call.reject("No print data");
            return;
        }

        executor.execute(() -> {
            try (Socket socket = new Socket()) {
                socket.connect(new InetSocketAddress(ip, port), 5000);
                socket.setSoTimeout(10000);
                try (OutputStream output = socket.getOutputStream()) {
                    output.write(bytes);
                    output.flush();
                }
                JSObject result = new JSObject();
                result.put("success", true);
                result.put("ip", ip);
                result.put("port", port);
                result.put("bytes", bytes.length);
                call.resolve(result);
            } catch (Exception error) {
                call.reject("Network print failed: " + error.getMessage());
            }
        });
    }

    @PluginMethod
    public void probeNetwork(PluginCall call) {
        String ip = call.getString("ip", "");
        Integer port = call.getInt("port", 9100);
        if (ip.isEmpty()) {
            call.reject("Printer IP is required");
            return;
        }
        executor.execute(() -> {
            try (Socket socket = new Socket()) {
                socket.connect(new InetSocketAddress(ip, port), 1500);
                JSObject result = new JSObject();
                result.put("reachable", true);
                result.put("ip", ip);
                result.put("port", port);
                call.resolve(result);
            } catch (Exception error) {
                JSObject result = new JSObject();
                result.put("reachable", false);
                result.put("ip", ip);
                result.put("port", port);
                result.put("error", error.getMessage());
                call.resolve(result);
            }
        });
    }

    @PluginMethod
    public void listPrinters(PluginCall call) {
        try {
            ensureUsbManager();
            JSArray printers = new JSArray();
            for (UsbDevice device : usbManager.getDeviceList().values()) {
                JSObject printer = new JSObject();
                printer.put("deviceName", device.getDeviceName());
                printer.put("vendorId", device.getVendorId());
                printer.put("productId", device.getProductId());
                printer.put("productName", device.getProductName());
                printer.put("manufacturerName", device.getManufacturerName());
                printer.put("hasPermission", usbManager.hasPermission(device));
                printers.put(printer);
            }
            JSObject result = new JSObject();
            result.put("printers", printers);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Could not list USB printers: " + error.getMessage());
        }
    }

    @PluginMethod
    public void requestUsbPermission(PluginCall call) {
        String deviceName = call.getString("deviceName", "");
        executor.execute(() -> {
            try {
                ensureUsbManager();
                UsbDevice device = findUsbDevice(deviceName);
                if (device == null) {
                    call.reject("USB printer not found: " + deviceName);
                    return;
                }
                if (usbManager.hasPermission(device)) {
                    resolvePermission(call, device, true);
                    return;
                }
                registerUsbReceiver();
                synchronized (pendingUsbPrints) {
                    pendingUsbPrints.put(device.getDeviceName(), new PendingUsbPrint(call, null));
                }
                requestUsbPermission(device);
            } catch (Exception error) {
                call.reject("USB permission request failed: " + error.getMessage());
            }
        });
    }

    @PluginMethod
    public void connectBluetooth(PluginCall call) {
        call.reject("Bluetooth printer connection not yet implemented.");
    }

    private void ensureUsbManager() {
        if (usbManager == null) {
            usbManager = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
            if (usbManager == null) throw new IllegalStateException("USB manager unavailable");
        }
    }

    private UsbDevice findUsbDevice(String deviceName) {
        for (UsbDevice device : usbManager.getDeviceList().values()) {
            if (device.getDeviceName().equals(deviceName)
                || deviceName.equals(device.getProductName())) return device;
        }
        return null;
    }

    private void registerUsbReceiver() {
        if (receiverRegistered) return;
        usbReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (!ACTION_USB_PERMISSION.equals(intent.getAction())) return;
                UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
                if (device == null) return;
                PendingUsbPrint pending;
                synchronized (pendingUsbPrints) {
                    pending = pendingUsbPrints.remove(device.getDeviceName());
                }
                if (pending == null) return;
                boolean granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false);
                if (!granted) {
                    pending.call.reject("USB printer permission denied");
                } else if (pending.bytes == null) {
                    resolvePermission(pending.call, device, true);
                } else {
                    executor.execute(() -> {
                        try {
                            sendUsb(device, pending.bytes, pending.call);
                        } catch (Exception error) {
                            pending.call.reject("USB print failed: " + error.getMessage());
                        }
                    });
                }
            }
        };
        IntentFilter filter = new IntentFilter(ACTION_USB_PERMISSION);
        if (Build.VERSION.SDK_INT >= 33) {
            getContext().registerReceiver(usbReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            getContext().registerReceiver(usbReceiver, filter);
        }
        receiverRegistered = true;
    }

    private void requestUsbPermission(UsbDevice device) {
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 31) flags |= PendingIntent.FLAG_MUTABLE;
        PendingIntent permissionIntent = PendingIntent.getBroadcast(
            getContext(), 0, new Intent(ACTION_USB_PERMISSION), flags
        );
        usbManager.requestPermission(device, permissionIntent);
    }

    private void sendUsb(UsbDevice device, byte[] bytes, PluginCall call) {
        UsbDeviceConnection connection = usbManager.openDevice(device);
        if (connection == null) throw new IllegalStateException("Could not open USB printer");

        UsbInterface printerInterface = null;
        UsbEndpoint outputEndpoint = null;
        try {
            for (int i = 0; i < device.getInterfaceCount() && outputEndpoint == null; i++) {
                UsbInterface candidate = device.getInterface(i);
                for (int j = 0; j < candidate.getEndpointCount(); j++) {
                    UsbEndpoint endpoint = candidate.getEndpoint(j);
                    if (endpoint.getType() == UsbConstants.USB_ENDPOINT_XFER_BULK
                        && endpoint.getDirection() == UsbConstants.USB_DIR_OUT) {
                        printerInterface = candidate;
                        outputEndpoint = endpoint;
                        break;
                    }
                }
            }
            if (printerInterface == null || outputEndpoint == null) {
                throw new IllegalStateException("No USB bulk output endpoint found");
            }
            if (!connection.claimInterface(printerInterface, true)) {
                throw new IllegalStateException("Could not claim USB printer interface");
            }

            int offset = 0;
            int chunkSize = Math.max(512, Math.min(outputEndpoint.getMaxPacketSize(), 16 * 1024));
            while (offset < bytes.length) {
                int length = Math.min(chunkSize, bytes.length - offset);
                int written = connection.bulkTransfer(outputEndpoint, bytes, offset, length, 5000);
                if (written != length) throw new IllegalStateException("USB printer wrote " + written + " of " + length + " bytes");
                offset += written;
            }
            JSObject result = new JSObject();
            result.put("success", true);
            result.put("deviceName", device.getDeviceName());
            result.put("bytes", bytes.length);
            call.resolve(result);
        } finally {
            if (printerInterface != null) connection.releaseInterface(printerInterface);
            connection.close();
        }
    }

    private void resolvePermission(PluginCall call, UsbDevice device, boolean granted) {
        JSObject result = new JSObject();
        result.put("granted", granted);
        result.put("deviceName", device.getDeviceName());
        call.resolve(result);
    }

    @Override
    protected void handleOnDestroy() {
        if (receiverRegistered && usbReceiver != null) {
            try { getContext().unregisterReceiver(usbReceiver); } catch (Exception ignored) { }
        }
        executor.shutdownNow();
        super.handleOnDestroy();
    }

    private byte[] jsArrayToBytes(JSArray array) {
        if (array == null) return new byte[0];
        try {
            Object[] objects = array.toList().toArray();
            byte[] bytes = new byte[objects.length];
            for (int i = 0; i < objects.length; i++) {
                if (objects[i] instanceof Number) bytes[i] = ((Number) objects[i]).byteValue();
            }
            return bytes;
        } catch (Exception error) {
            return new byte[0];
        }
    }

    private static final class PendingUsbPrint {
        private final PluginCall call;
        private final byte[] bytes;

        private PendingUsbPrint(PluginCall call, byte[] bytes) {
            this.call = call;
            this.bytes = bytes;
        }
    }
}
