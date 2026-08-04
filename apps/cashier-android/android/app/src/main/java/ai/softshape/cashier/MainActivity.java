package ai.softshape.cashier;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        // Register the ESC/POS print plugin before super.onCreate
        registerPlugin(EscposPrintPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
