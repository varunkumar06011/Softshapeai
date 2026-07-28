package ai.softshape.captain;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.util.Enumeration;

/**
 * Local Network Plugin for Captain Android.
 *
 * Exposes the device's local IP address (on the current WiFi/LAN) to JS
 * so that discoverEdgeOnLAN() can probe the actual /24 subnet instead of
 * guessing from a hardcoded list of common gateway IPs.
 *
 * Uses ConnectivityManager.getLinkProperties() (API 21+, no location
 * permission required — only ACCESS_NETWORK_STATE, already declared).
 * Falls back to NetworkInterface enumeration if ConnectivityManager
 * returns null, preferring wlan interfaces to avoid picking up VPN IPs.
 */
@CapacitorPlugin(name = "LocalNetwork")
public class LocalNetworkPlugin extends Plugin {

    @PluginMethod
    public void getLocalIp(PluginCall call) {
        String ip = getLocalIpViaConnectivityManager();
        if (ip == null) {
            ip = getLocalIpViaNetworkInterface();
        }

        if (ip != null) {
            JSObject result = new JSObject();
            result.put("ip", ip);
            call.resolve(result);
        } else {
            call.reject("Could not determine local IP address");
        }
    }

    /**
     * Primary path: ConnectivityManager.getLinkProperties() for the active
     * network. Works on API 21+ with only ACCESS_NETWORK_STATE permission.
     * No ACCESS_FINE_LOCATION required (unlike WifiManager.getConnectionInfo).
     */
    private String getLocalIpViaConnectivityManager() {
        try {
            Context ctx = getContext();
            ConnectivityManager cm = (ConnectivityManager) ctx.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return null;

            Network activeNetwork = cm.getActiveNetwork();
            if (activeNetwork == null) return null;

            // Only use WiFi transport to avoid picking up cellular/VPN
            NetworkCapabilities caps = cm.getNetworkCapabilities(activeNetwork);
            if (caps == null || !caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
                return null;
            }

            LinkProperties lp = cm.getLinkProperties(activeNetwork);
            if (lp == null) return null;

            for (java.net.LinkAddress la : lp.getLinkAddresses()) {
                InetAddress addr = la.getAddress();
                if (addr instanceof Inet4Address && !addr.isLoopbackAddress()) {
                    return addr.getHostAddress();
                }
            }
        } catch (Exception e) {
            // Fall through to NetworkInterface enumeration
        }
        return null;
    }

    /**
     * Fallback: enumerate NetworkInterfaces. Prefer wlan interfaces to
     * avoid picking up VPN tunnel interfaces (which often have RFC 1918
     * addresses but are on the wrong subnet for LAN printer discovery).
     */
    private String getLocalIpViaNetworkInterface() {
        try {
            // First pass: look for wlan interfaces
            String ip = scanInterfaces(true);
            if (ip != null) return ip;

            // Second pass: any non-loopback, non-vpn site-local IPv4
            return scanInterfaces(false);
        } catch (Exception e) {
            return null;
        }
    }

    private String scanInterfaces(boolean wlanOnly) {
        try {
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            while (interfaces != null && interfaces.hasMoreElements()) {
                NetworkInterface ni = interfaces.nextElement();
                if (ni.isLoopback() || !ni.isUp()) continue;

                String name = ni.getName();
                if (name == null) continue;
                boolean isWlan = name.startsWith("wlan") || name.startsWith("eth");
                boolean isVpn = name.startsWith("tun") || name.startsWith("ppp") || name.startsWith("rmnet");

                if (wlanOnly && !isWlan) continue;
                if (!wlanOnly && isVpn) continue;

                Enumeration<InetAddress> addresses = ni.getInetAddresses();
                while (addresses.hasMoreElements()) {
                    InetAddress addr = addresses.nextElement();
                    if (addr instanceof Inet4Address && !addr.isLoopbackAddress() && addr.isSiteLocalAddress()) {
                        return addr.getHostAddress();
                    }
                }
            }
        } catch (Exception e) {
            // ignore
        }
        return null;
    }
}
