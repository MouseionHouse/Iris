package house.mouseion.iris;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Must run before super.onCreate(): the bridge is created (and the launch intent
        // replayed through onNewIntent) at the end of BridgeActivity.onCreate.
        registerPlugin(MouseionSharePlugin.class);
        registerPlugin(MouseionPushPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
