package ai.softshape.admin;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(EscposPrintPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
