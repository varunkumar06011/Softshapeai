package ai.softshape.captain;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Native HTTP Plugin for Captain Android.
 *
 * Bypasses the WebView's fetch() which has aggressive timeouts (8-15s) that
 * fail on weak/slow WiFi. Uses HttpURLConnection with a 30s read timeout and
 * OS-level TCP retry, so KOT writes go through even when the captain is far
 * from the router and packets arrive slowly.
 *
 * Only used for edge server POST writes (KOT submission). Reads and cloud
 * calls still use fetch() — they're less time-sensitive and benefit from
 * browser caching/cookies.
 */
@CapacitorPlugin(name = "NativeHttp")
public class NativeHttpPlugin extends Plugin {

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void post(PluginCall call) {
        String url = call.getString("url", "");
        String body = call.getString("body", "");
        int timeoutMs = call.getInt("timeout", 30000);

        if (url.isEmpty()) {
            call.reject("URL is required");
            return;
        }

        final String finalUrl = url;
        final String finalBody = body;
        final int finalTimeout = timeoutMs;

        executor.execute(() -> {
            HttpURLConnection conn = null;
            try {
                URL u = new URL(finalUrl);
                conn = (HttpURLConnection) u.openConnection();
                conn.setRequestMethod("POST");
                conn.setConnectTimeout(5000);   // 5s to establish TCP
                conn.setReadTimeout(finalTimeout); // 30s for response
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setDoOutput(true);

                // Pass through edge auth headers if provided
                String edgeKey = call.getString("edgeKey", null);
                String authToken = call.getString("authToken", null);
                String localToken = call.getString("localToken", null);
                if (edgeKey != null && !edgeKey.isEmpty()) {
                    conn.setRequestProperty("X-Edge-Key", edgeKey);
                }
                if (authToken != null && !authToken.isEmpty()) {
                    conn.setRequestProperty("Authorization", "Bearer " + authToken);
                }
                if (localToken != null && !localToken.isEmpty()) {
                    conn.setRequestProperty("X-Local-Token", localToken);
                }

                // Write body
                byte[] bodyBytes = finalBody.getBytes("UTF-8");
                OutputStream os = conn.getOutputStream();
                os.write(bodyBytes);
                os.flush();
                os.close();

                int status = conn.getResponseCode();
                StringBuilder response = new StringBuilder();
                InputStream is = null;
                try {
                    is = status >= 200 && status < 400 ? conn.getInputStream() : conn.getErrorStream();
                } catch (Exception ignored) { }
                if (is != null) {
                    BufferedReader reader = new BufferedReader(new InputStreamReader(is, "UTF-8"));
                    String line;
                    while ((line = reader.readLine()) != null) {
                        response.append(line).append('\n');
                    }
                    reader.close();
                }

                JSObject result = new JSObject();
                result.put("status", status);
                result.put("data", response.toString().trim());
                call.resolve(result);
            } catch (java.net.SocketTimeoutException e) {
                call.reject("TIMEOUT: " + e.getMessage());
            } catch (java.net.ConnectException e) {
                call.reject("CONNECT_FAILED: " + e.getMessage());
            } catch (Exception e) {
                call.reject("HTTP_ERROR: " + e.getMessage());
            } finally {
                if (conn != null) conn.disconnect();
            }
        });
    }
}
