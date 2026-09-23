package house.mouseion.chat;

import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Receives text shared from other apps (ACTION_SEND) and forwards it to the web app.
 *
 * The activity's manifest declares an ACTION_SEND/text/* intent filter, so Android offers
 * Mouseion Chat as a share target. handleOnNewIntent covers both arrival paths:
 * - cold start: BridgeActivity.load() replays the launch intent through onNewIntent,
 * - warm start: the activity is singleTask, so a share while the app is running arrives
 *   as a new intent on the existing activity.
 *
 * The event is notified with retainUntilConsumed=true: if the WebView has not loaded yet
 * (cold start), the payload is retained and delivered when the web app first registers a
 * listener for it.
 */
@CapacitorPlugin(name = "MouseionShare")
public class MouseionSharePlugin extends Plugin {

    public static final String EVENT_SHARED_CONTENT = "sharedContent";

    @Override
    protected void handleOnNewIntent(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) {
            return;
        }

        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (text == null || text.isEmpty()) {
            // Some apps share the body in EXTRA_SUBJECT only.
            text = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        }
        if (text == null || text.isEmpty()) {
            return;
        }

        JSObject data = new JSObject();
        data.put("text", text);
        notifyListeners(EVENT_SHARED_CONTENT, data, true);
    }
}
