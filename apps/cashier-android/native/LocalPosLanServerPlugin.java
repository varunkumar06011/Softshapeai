package ai.softshape.cashier;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "LocalPosLanServer")
public class LocalPosLanServerPlugin extends Plugin {
    private static final int MAX_REQUEST_BODY_BYTES = 2 * 1024 * 1024;
    private static final int CLIENT_READ_TIMEOUT_MS = 5000;
    private final ExecutorService acceptor = Executors.newSingleThreadExecutor();
    private final ExecutorService clients = Executors.newCachedThreadPool();
    private final Map<String, PendingRequest> requests = new HashMap<>();
    private ServerSocket serverSocket;
    private int port;

    @PluginMethod
    public void start(PluginCall call) {
        int requestedPort = call.getInt("port", 3101);
        if (requestedPort < 1024 || requestedPort > 65535) {
            call.reject("LAN server port must be between 1024 and 65535");
            return;
        }

        synchronized (this) {
            if (serverSocket != null && !serverSocket.isClosed()) {
                resolveStatus(call);
                return;
            }
            try {
                serverSocket = new ServerSocket(requestedPort, 50, InetAddress.getByName("0.0.0.0"));
                port = serverSocket.getLocalPort();
            } catch (IOException error) {
                call.reject("Could not start local LAN server: " + error.getMessage());
                return;
            }
        }

        acceptor.execute(this::acceptClients);
        resolveStatus(call);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        synchronized (this) {
            closeServer();
            for (PendingRequest request : requests.values()) request.close();
            requests.clear();
        }
        JSObject result = new JSObject();
        result.put("listening", false);
        call.resolve(result);
    }

    @PluginMethod
    public void status(PluginCall call) {
        resolveStatus(call);
    }

    @PluginMethod
    public void respond(PluginCall call) {
        String requestId = call.getString("requestId", "");
        int status = call.getInt("status", 200);
        String body = call.getString("body", "{}");
        PendingRequest request;
        synchronized (this) {
            request = requests.remove(requestId);
        }
        if (request == null) {
            call.reject("LAN request has expired or was already answered");
            return;
        }

        try {
            request.write(status, body);
            JSObject result = new JSObject();
            result.put("responded", true);
            call.resolve(result);
        } catch (IOException error) {
            call.reject("Could not respond to LAN request: " + error.getMessage());
        } finally {
            request.close();
        }
    }

    private void acceptClients() {
        while (true) {
            ServerSocket current;
            synchronized (this) {
                current = serverSocket;
                if (current == null || current.isClosed()) return;
            }
            try {
                Socket socket = current.accept();
                clients.execute(() -> handleClient(socket));
            } catch (IOException error) {
                synchronized (this) {
                    if (serverSocket == null || serverSocket.isClosed()) return;
                }
            }
        }
    }

    private void handleClient(Socket socket) {
        try {
            socket.setSoTimeout(CLIENT_READ_TIMEOUT_MS);
            socket.setKeepAlive(false);
            BufferedReader reader = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
            String requestLine = reader.readLine();
            if (requestLine == null) {
                socket.close();
                return;
            }
            String[] requestParts = requestLine.split(" ", 3);
            if (requestParts.length < 2) {
                socket.close();
                return;
            }

            Map<String, String> headers = new HashMap<>();
            String line;
            int contentLength = 0;
            while ((line = reader.readLine()) != null && !line.isEmpty()) {
                int separator = line.indexOf(':');
                if (separator <= 0) continue;
                String name = line.substring(0, separator).trim().toLowerCase();
                String value = line.substring(separator + 1).trim();
                headers.put(name, value);
                if ("content-length".equals(name)) {
                    try { contentLength = Integer.parseInt(value); } catch (NumberFormatException ignored) { }
                }
            }

            if (contentLength > MAX_REQUEST_BODY_BYTES) {
                writeAndClose(socket, 413, "{\"error\":\"Request body is too large\"}");
                return;
            }
            char[] bodyChars = new char[Math.max(0, contentLength)];
            int read = 0;
            while (read < bodyChars.length) {
                int count = reader.read(bodyChars, read, bodyChars.length - read);
                if (count < 0) break;
                read += count;
            }
            String body = new String(bodyChars, 0, read);

            if ("/health".equals(requestParts[1])) {
                writeAndClose(socket, 200, "{\"ok\":true,\"isOperational\":true,\"sessionValid\":true,\"onboarded\":true,\"service\":\"softshape-cashier-local-pos\"}");
                return;
            }

            String requestId = UUID.randomUUID().toString();
            synchronized (this) {
                requests.put(requestId, new PendingRequest(socket));
            }
            JSObject request = new JSObject();
            JSObject headerObject = new JSObject();
            for (Map.Entry<String, String> header : headers.entrySet()) {
                headerObject.put(header.getKey(), header.getValue());
            }
            request.put("requestId", requestId);
            request.put("method", requestParts[0]);
            request.put("path", requestParts[1]);
            request.put("headers", headerObject);
            request.put("body", body);
            request.put("contentLength", contentLength);
            notifyListeners("request", request);
        } catch (IOException error) {
            try { socket.close(); } catch (IOException ignored) { }
        }
    }

    private void writeAndClose(Socket socket, int status, String body) throws IOException {
        PendingRequest request = new PendingRequest(socket);
        try {
            request.write(status, body);
        } finally {
            request.close();
        }
    }

    private void resolveStatus(PluginCall call) {
        JSObject result = new JSObject();
        synchronized (this) {
            result.put("listening", serverSocket != null && !serverSocket.isClosed());
            result.put("port", port);
        }
        call.resolve(result);
    }

    private void closeServer() {
        if (serverSocket != null) {
            try { serverSocket.close(); } catch (IOException ignored) { }
            serverSocket = null;
        }
        port = 0;
    }

    @Override
    protected void handleOnDestroy() {
        synchronized (this) {
            closeServer();
            for (PendingRequest request : requests.values()) request.close();
            requests.clear();
        }
        acceptor.shutdownNow();
        clients.shutdownNow();
        super.handleOnDestroy();
    }

    private static final class PendingRequest {
        private final Socket socket;

        private PendingRequest(Socket socket) {
            this.socket = socket;
        }

        private void write(int status, String body) throws IOException {
            byte[] bodyBytes = body.getBytes(StandardCharsets.UTF_8);
            String statusText = status == 200 ? "OK" : "Error";
            String response = "HTTP/1.1 " + status + " " + statusText + "\r\n"
                + "Content-Type: application/json\r\n"
                + "Content-Length: " + bodyBytes.length + "\r\n"
                + "Connection: close\r\n\r\n";
            OutputStream output = socket.getOutputStream();
            output.write(response.getBytes(StandardCharsets.US_ASCII));
            output.write(bodyBytes);
            output.flush();
        }

        private void close() {
            try { socket.close(); } catch (IOException ignored) { }
        }
    }
}
