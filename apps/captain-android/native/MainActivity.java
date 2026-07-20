package ai.softshape.captain;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(EscposPrintPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
