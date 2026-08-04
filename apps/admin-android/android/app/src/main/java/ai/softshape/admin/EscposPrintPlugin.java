package ai.softshape.admin;

import com.getcapacitor.JSObject;
import com.getcapacitor.JSArray;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * ESC/POS Print Plugin for Android (Admin).
 * Stub — same as cashier version.
 */
@CapacitorPlugin(name = "EscposPrint")
public class EscposPrintPlugin extends Plugin {

    @PluginMethod
    public void printRaw(PluginCall call) {
        call.reject("Android ESC/POS printing not yet implemented. Use network printing or PWA fallback.");
    }

    @PluginMethod
    public void printNetwork(PluginCall call) {
        call.reject("Android network printing not yet implemented.");
    }

    @PluginMethod
    public void listPrinters(PluginCall call) {
        JSObject result = new JSObject();
        result.put("printers", new JSArray());
        call.resolve(result);
    }

    @PluginMethod
    public void connectBluetooth(PluginCall call) {
        call.reject("Bluetooth printer connection not yet implemented.");
    }
}
