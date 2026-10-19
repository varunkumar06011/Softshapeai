package ai.softshape.captain;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback wifiCallback;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(EscposPrintPlugin.class);
        registerPlugin(LocalNetworkPlugin.class);
        registerPlugin(NativeHttpPlugin.class);
        super.onCreate(savedInstanceState);
        stayOnWifi();
    }

    /**
     * Keep all of this app's traffic on the restaurant WiFi.
     *
     * When the WiFi has no internet, Android marks it "no internet" and moves
     * the default network to mobile data — so requests to the billing PC
     * (192.168.x.x) went out over mobile data and failed, although the phone
     * still showed WiFi as connected. The captain app only ever talks to the
     * billing PC on the LAN, so it is bound to the WiFi network whenever one
     * is connected, internet or not. Other apps on the phone are unaffected.
     */
    private void stayOnWifi() {
        try {
            connectivityManager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (connectivityManager == null) return;
            NetworkRequest request = new NetworkRequest.Builder()
                    .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
                    .removeCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                    .build();
            wifiCallback = new ConnectivityManager.NetworkCallback() {
                @Override
                public void onAvailable(Network network) {
                    connectivityManager.bindProcessToNetwork(network);
                }

                @Override
                public void onLost(Network network) {
                    // Only unbind if this was the network we were bound to;
                    // otherwise a newer WiFi network is already bound.
                    if (network.equals(connectivityManager.getBoundNetworkForProcess())) {
                        connectivityManager.bindProcessToNetwork(null);
                    }
                }
            };
            connectivityManager.registerNetworkCallback(request, wifiCallback);
        } catch (Exception e) {
            // Never block app start — without the binding the app still works
            // whenever the WiFi has internet.
        }
    }

    @Override
    public void onDestroy() {
        if (connectivityManager != null && wifiCallback != null) {
            try {
                connectivityManager.unregisterNetworkCallback(wifiCallback);
                connectivityManager.bindProcessToNetwork(null);
            } catch (Exception e) {
                // ignore
            }
        }
        super.onDestroy();
    }
}
