package house.mouseion.chat;

import java.nio.charset.StandardCharsets;
import org.unifiedpush.android.connector.FailedReason;
import org.unifiedpush.android.connector.PushService;
import org.unifiedpush.android.connector.data.PushEndpoint;
import org.unifiedpush.android.connector.data.PushMessage;

/**
 * Receives UnifiedPush events from the distributor (ntfy). Synapse's pusher for this device points
 * at ntfy's Matrix gateway with format event_id_only, so each message names one event;
 * PushNotifier fetches and shows it.
 *
 * The pusher itself is owned by the web app (mobile/WRAPPER-PLAN.md, "Bridge contract"): a new
 * endpoint is stored here and handed to the web app, which registers it with setPusher on the
 * event and again at every start.
 */
public class MouseionPushService extends PushService {

    @Override
    public void onNewEndpoint(PushEndpoint endpoint, String instance) {
        String pushkey = endpoint.getUrl();
        PushStore.prefs(this).edit().putString(PushStore.KEY_ENDPOINT, pushkey).putString(PushStore.KEY_ERROR, "").apply();
        MouseionPushPlugin.emitEndpoint(pushkey);
    }

    @Override
    public void onMessage(PushMessage message, String instance) {
        // ntfy delivers the payload in the clear (decrypted=false is normal); the JSON parse in
        // PushNotifier is the real guard.
        PushNotifier.onPush(this, new String(message.getContent(), StandardCharsets.UTF_8));
    }

    @Override
    public void onRegistrationFailed(FailedReason reason, String instance) {
        PushStore.prefs(this).edit().putString(PushStore.KEY_ERROR, "the push app refused the registration (" + reason + ")").apply();
        MouseionPushPlugin.emitStateChanged();
    }

    @Override
    public void onUnregistered(String instance) {
        // The push app dropped the registration (or was uninstalled): the pusher is dead.
        String pushkey = PushStore.prefs(this).getString(PushStore.KEY_ENDPOINT, null);
        PushStore.prefs(this).edit().remove(PushStore.KEY_ENDPOINT).apply();
        if (pushkey != null) MouseionPushPlugin.emitUnregistered(pushkey);
    }
}
