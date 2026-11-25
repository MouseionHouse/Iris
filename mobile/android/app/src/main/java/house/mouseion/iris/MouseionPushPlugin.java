package house.mouseion.iris;

import static org.unifiedpush.android.connector.ConstantsKt.INSTANCE_DEFAULT;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import org.unifiedpush.android.connector.UnifiedPush;

/**
 * The "MouseionPush" bridge (mobile/README.md, "Bridge contract"): lets the web app turn
 * UnifiedPush on and off, hands it the endpoint so it can own the Matrix pusher, stores the
 * session the push service fetches events with, and reports notification taps.
 *
 * Events (all retained until the web app listens, so cold starts lose nothing):
 * - endpoint {pushkey}: register/refresh the pusher for it.
 * - unregistered {pushkey}: remove that pusher.
 * - notificationTap {roomId}: open the room.
 * - stateChanged {}: re-read getState (e.g. a registration failed).
 */
@CapacitorPlugin(
    name = "MouseionPush",
    permissions = { @Permission(alias = MouseionPushPlugin.PERMISSION_NOTIFICATIONS, strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public class MouseionPushPlugin extends Plugin {

    static final String PERMISSION_NOTIFICATIONS = "notifications";

    private static volatile MouseionPushPlugin instance;
    private static volatile boolean appVisible;

    @Override
    public void load() {
        instance = this;
        PushNotifier.createChannel(getContext());
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) instance = null;
        appVisible = false;
    }

    @Override
    protected void handleOnResume() {
        appVisible = true;
    }

    @Override
    protected void handleOnPause() {
        appVisible = false;
    }

    static boolean isAppVisible() {
        return appVisible;
    }

    static void emitEndpoint(String pushkey) {
        MouseionPushPlugin plugin = instance;
        if (plugin == null) return; // The web app registers the stored endpoint at its next start.
        JSObject data = new JSObject();
        data.put("pushkey", pushkey);
        plugin.notifyListeners("endpoint", data, true);
    }

    static void emitUnregistered(String pushkey) {
        MouseionPushPlugin plugin = instance;
        if (plugin == null) return;
        JSObject data = new JSObject();
        data.put("pushkey", pushkey);
        plugin.notifyListeners("unregistered", data, true);
    }

    static void emitStateChanged() {
        MouseionPushPlugin plugin = instance;
        if (plugin != null) plugin.notifyListeners("stateChanged", new JSObject());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        String roomId = intent != null ? intent.getStringExtra(PushNotifier.EXTRA_ROOM_ID) : null;
        if (roomId == null || roomId.isEmpty()) return;
        JSObject data = new JSObject();
        data.put("roomId", roomId);
        notifyListeners("notificationTap", data, true);
    }

    @PluginMethod
    public void getState(PluginCall call) {
        Context context = getContext();
        PackageManager pm = context.getPackageManager();
        JSArray distributors = new JSArray();
        for (String id : UnifiedPush.getDistributors(context)) {
            if (id.equals(context.getPackageName())) continue;
            String label = id;
            try {
                ApplicationInfo info = pm.getApplicationInfo(id, 0);
                label = pm.getApplicationLabel(info).toString();
            } catch (PackageManager.NameNotFoundException ignored) {
                // Keep the package id.
            }
            JSObject distributor = new JSObject();
            distributor.put("id", id);
            distributor.put("label", label);
            distributors.put(distributor);
        }
        JSObject state = new JSObject();
        state.put("distributors", distributors);
        state.put("distributor", UnifiedPush.getSavedDistributor(context));
        state.put("endpoint", PushStore.prefs(context).getString(PushStore.KEY_ENDPOINT, null));
        state.put("notificationsAllowed", NotificationManagerCompat.from(context).areNotificationsEnabled());
        String error = PushStore.prefs(context).getString(PushStore.KEY_ERROR, "");
        if (error != null && !error.isEmpty()) state.put("error", error);
        state.put("deviceName", Build.MODEL);
        call.resolve(state);
    }

    /** Use [distributor] and register with it; asks for POST_NOTIFICATIONS first (API 33+). */
    @PluginMethod
    public void enable(PluginCall call) {
        String distributor = call.getString("distributor");
        if (distributor == null || distributor.isEmpty()) {
            call.reject("distributor is required");
            return;
        }
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState(PERMISSION_NOTIFICATIONS) != PermissionState.GRANTED) {
            requestPermissionForAlias(PERMISSION_NOTIFICATIONS, call, "enableAfterPermission");
            return;
        }
        register(call, distributor);
    }

    @PermissionCallback
    private void enableAfterPermission(PluginCall call) {
        // Register either way: getState reports whether Android lets the notifications show.
        register(call, call.getString("distributor"));
    }

    private void register(PluginCall call, String distributor) {
        Context context = getContext();
        PushStore.prefs(context).edit().putString(PushStore.KEY_ERROR, "").apply();
        UnifiedPush.saveDistributor(context, distributor);
        UnifiedPush.register(context, INSTANCE_DEFAULT, "Iris", null);
        call.resolve();
    }

    /**
     * Re-register with the distributor already in use, as UnifiedPush recommends at every start:
     * confirms the registration and delivers the endpoint (again) as an `endpoint` event.
     */
    @PluginMethod
    public void refresh(PluginCall call) {
        Context context = getContext();
        boolean registered = UnifiedPush.getAckDistributor(context) != null;
        if (registered) UnifiedPush.register(context, INSTANCE_DEFAULT, "Iris", null);
        JSObject result = new JSObject();
        result.put("registered", registered);
        call.resolve(result);
    }

    /** Stop push; resolves the pushkey that was in use so the web app can remove its pusher. */
    @PluginMethod
    public void disable(PluginCall call) {
        Context context = getContext();
        String pushkey = PushStore.prefs(context).getString(PushStore.KEY_ENDPOINT, null);
        UnifiedPush.unregister(context, INSTANCE_DEFAULT);
        PushStore.prefs(context).edit().remove(PushStore.KEY_ENDPOINT).putString(PushStore.KEY_ERROR, "").apply();
        JSObject result = new JSObject();
        if (pushkey != null) result.put("pushkey", pushkey);
        call.resolve(result);
    }

    @PluginMethod
    public void setSession(PluginCall call) {
        String baseUrl = call.getString("baseUrl");
        String userId = call.getString("userId");
        String accessToken = call.getString("accessToken");
        if (baseUrl == null || userId == null || accessToken == null) {
            call.reject("baseUrl, userId and accessToken are required");
            return;
        }
        try {
            PushStore.saveSession(getContext(), baseUrl, userId, accessToken);
            call.resolve();
        } catch (Exception e) {
            call.reject("could not store the session", e);
        }
    }

    @PluginMethod
    public void clearSession(PluginCall call) {
        PushStore.clearSession(getContext());
        PushNotifier.clearAll(getContext());
        call.resolve();
    }

    /** The rooms the app counts as unread, sent while it is on screen and in sync. */
    @PluginMethod
    public void setUnreadRooms(PluginCall call) {
        JSArray roomIds = call.getArray("roomIds");
        if (roomIds == null) {
            call.reject("roomIds is required");
            return;
        }
        try {
            PushNotifier.setUnreadRooms(getContext(), roomIds.<String>toList());
            call.resolve();
        } catch (Exception e) {
            call.reject("roomIds must be strings", e);
        }
    }

    @PluginMethod
    public void setSoundEnabled(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", true));
        PushStore.prefs(getContext()).edit().putString(PushStore.KEY_SOUND, enabled ? "true" : "false").apply();
        call.resolve();
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
            .putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName())
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }
}
