package ai.softshape.cashier;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * ESC/POS Print Plugin for Android.
 *
 * Supports printing to Bluetooth and USB ESC/POS printers.
 * This is a stub implementation — actual Bluetooth/USB printing
 * requires connecting to the printer via Android BluetoothManager
 * or UsbManager and sending raw bytes.
 *
 * TODO: Implement actual Bluetooth/USB ESC/POS printing using:
 *   - android.bluetooth.BluetoothSocket for Bluetooth printers
 *   - android.hardware.usb.UsbDeviceConnection for USB printers
 */
@CapacitorPlugin(name = "EscposPrint")
public class EscposPrintPlugin extends Plugin {

    @PluginMethod
    public void printRaw(PluginCall call) {
        String printerName = call.getString("printerName", "");
        // bytes are passed as an Array of numbers from JS
        // In a real implementation, convert to byte[] and send via Bluetooth/USB
        call.reject("Android ESC/POS printing not yet implemented. Use network printing or PWA fallback.");
    }

    @PluginMethod
    public void printNetwork(PluginCall call) {
        String ip = call.getString("ip", "");
        Integer port = call.getInt("port", 9100);
        // bytes passed from JS
        // In a real implementation, open a TCP socket to ip:port and write bytes
        call.reject("Android network printing not yet implemented.");
    }

    @PluginMethod
    public void listPrinters(PluginCall call) {
        // Return empty list — no printers discovered yet
        JSObject result = new JSObject();
        result.put("printers", new JSArray());
        call.resolve(result);
    }

    @PluginMethod
    public void connectBluetooth(PluginCall call) {
        String address = call.getString("address", "");
        // TODO: Implement Bluetooth pairing + connection
        call.reject("Bluetooth printer connection not yet implemented.");
    }
}
