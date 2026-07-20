package ai.softshape.captain;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * ESC/POS Print Plugin for Captain Android.
 *
 * Supports printing to network (TCP/IP) ESC/POS thermal printers.
 * This is the primary local print path for the captain APK when the
 * edge server is unreachable — the captain can print directly to a
 * kitchen/bar printer on the LAN via TCP port 9100.
 *
 * Network printing is implemented with a blocking TCP socket on a
 * background thread. Bluetooth/USB printing requires native hardware
 * APIs and is left as a stub for now.
 */
@CapacitorPlugin(name = "EscposPrint")
public class EscposPrintPlugin extends Plugin {

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void printRaw(PluginCall call) {
        call.reject("Bluetooth/USB printing not yet implemented. Use network printing via printNetwork.");
    }

    @PluginMethod
    public void printNetwork(PluginCall call) {
        String ip = call.getString("ip", "");
        Integer port = call.getInt("port", 9100);
        JSArray bytesArray = call.getArray("bytes", new JSArray());
        byte[] bytes = jsArrayToBytes(bytesArray);

        if (ip.isEmpty()) {
            call.reject("Printer IP is required");
            return;
        }
        if (bytes.length == 0) {
            call.reject("No print data");
            return;
        }

        final String finalIp = ip;
        final int finalPort = port;
        final byte[] finalBytes = bytes;

        executor.execute(() -> {
            Socket socket = null;
            OutputStream out = null;
            try {
                socket = new Socket();
                socket.connect(new InetSocketAddress(finalIp, finalPort), 5000);
                socket.setSoTimeout(10000);
                out = socket.getOutputStream();
                out.write(finalBytes);
                out.flush();
                Thread.sleep(500);

                JSObject result = new JSObject();
                result.put("success", true);
                call.resolve(result);
            } catch (Exception e) {
                call.reject("Network print failed: " + e.getMessage());
            } finally {
                try { if (out != null) out.close(); } catch (Exception ignored) {}
                try { if (socket != null) socket.close(); } catch (Exception ignored) {}
            }
        });
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

    private byte[] jsArrayToBytes(JSArray array) {
        if (array == null) return new byte[0];
        try {
            Object[] objects = array.toList().toArray();
            byte[] bytes = new byte[objects.length];
            for (int i = 0; i < objects.length; i++) {
                if (objects[i] instanceof Number) {
                    bytes[i] = ((Number) objects[i]).byteValue();
                } else {
                    bytes[i] = 0;
                }
            }
            return bytes;
        } catch (Exception e) {
            return new byte[0];
        }
    }
}
