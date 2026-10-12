package house.mouseion.iris;

import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.Rect;
import android.util.Base64;
import androidx.core.content.pm.ShortcutInfoCompat;
import androidx.core.content.pm.ShortcutManagerCompat;
import androidx.core.graphics.drawable.IconCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Text sharing into Iris, both ways Android offers it.
 *
 * App target: the manifest's ACTION_SEND/text/* filter lists the app in the share sheet.
 * Per-chat targets (Direct Share): setShareTargets publishes long-lived dynamic shortcuts in
 * the category declared by res/xml/shortcuts.xml, so recent chats appear in the sheet
 * themselves. Picking one sends the same ACTION_SEND with Intent.EXTRA_SHORTCUT_ID set.
 * The same shortcuts show on a long-press of the launcher icon; those launch a VIEW intent
 * carrying EXTRA_ROOM_ID, forwarded as an `openRoom` event.
 *
 * handleOnNewIntent covers both arrival paths: cold start (BridgeActivity.load() replays the
 * launch intent through onNewIntent) and warm start (singleTask delivers a new intent).
 * Events use retainUntilConsumed=true, so a payload that arrives before the WebView has
 * loaded is delivered when the web app first registers its listener.
 */
@CapacitorPlugin(name = "MouseionShare")
public class MouseionSharePlugin extends Plugin {

    public static final String EVENT_SHARED_CONTENT = "sharedContent";
    public static final String EVENT_OPEN_ROOM = "openRoom";
    public static final String EXTRA_ROOM_ID = "house.mouseion.iris.ROOM_ID";

    private static final String SHARE_CATEGORY = "house.mouseion.iris.category.TEXT_SHARE_TARGET";
    private static final String SHORTCUT_ID_PREFIX = "room:";
    // The share sheet truncates short labels longer than this.
    private static final int MAX_LABEL_LENGTH = 20;
    private static final int ICON_SIZE_PX = 192;

    @Override
    protected void handleOnNewIntent(Intent intent) {
        if (intent == null) {
            return;
        }

        if (Intent.ACTION_VIEW.equals(intent.getAction())) {
            String roomId = intent.getStringExtra(EXTRA_ROOM_ID);
            if (roomId != null && !roomId.isEmpty()) {
                JSObject data = new JSObject();
                data.put("roomId", roomId);
                notifyListeners(EVENT_OPEN_ROOM, data, true);
            }
            return;
        }

        if (!Intent.ACTION_SEND.equals(intent.getAction())) {
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
        String shortcutId = intent.getStringExtra(Intent.EXTRA_SHORTCUT_ID);
        if (shortcutId != null && shortcutId.startsWith(SHORTCUT_ID_PREFIX)) {
            data.put("roomId", shortcutId.substring(SHORTCUT_ID_PREFIX.length()));
        }
        notifyListeners(EVENT_SHARED_CONTENT, data, true);
    }

    /**
     * Replaces the per-chat share targets. Expects {targets: [{roomId, label, avatar?}]} (avatar: base64 PNG), most relevant
     * first; anything past the launcher's per-activity limit is dropped. An empty list (sign
     * out) removes them all, so chat names do not linger in the share sheet.
     */
    @PluginMethod
    public void setShareTargets(PluginCall call) {
        Context context = getContext();
        try {
            JSONArray targets = call.getData().optJSONArray("targets");
            if (targets == null || targets.length() == 0) {
                ShortcutManagerCompat.removeAllDynamicShortcuts(context);
                call.resolve();
                return;
            }

            int max = ShortcutManagerCompat.getMaxShortcutCountPerActivity(context);
            List<ShortcutInfoCompat> shortcuts = new ArrayList<>();
            for (int i = 0; i < targets.length() && shortcuts.size() < max; i++) {
                JSONObject target = targets.getJSONObject(i);
                String roomId = target.optString("roomId", "");
                String label = target.optString("label", "");
                if (roomId.isEmpty() || label.isEmpty()) {
                    continue;
                }
                Bitmap avatar = decodeAvatar(target.optString("avatar", ""));
                shortcuts.add(buildShortcut(context, roomId, label, avatar, shortcuts.size()));
            }

            ShortcutManagerCompat.setDynamicShortcuts(context, shortcuts);
            call.resolve();
        } catch (JSONException | RuntimeException e) {
            call.reject("Could not set share targets", e);
        }
    }

    private static ShortcutInfoCompat buildShortcut(
        Context context,
        String roomId,
        String label,
        Bitmap avatar,
        int rank
    ) {
        Intent launch = new Intent(context, MainActivity.class)
            .setAction(Intent.ACTION_VIEW)
            .putExtra(EXTRA_ROOM_ID, roomId);

        return new ShortcutInfoCompat.Builder(context, SHORTCUT_ID_PREFIX + roomId)
            .setShortLabel(shorten(label))
            .setLongLabel(label)
            .setIcon(IconCompat.createWithBitmap(avatar != null ? avatar : letterAvatar(roomId, label)))
            .setIntent(launch)
            .setLongLived(true)
            .setRank(rank)
            .setCategories(Collections.singleton(SHARE_CATEGORY))
            .build();
    }

    private static String shorten(String label) {
        if (label.length() <= MAX_LABEL_LENGTH) {
            return label;
        }
        return label.substring(0, MAX_LABEL_LENGTH - 1) + "…";
    }

    /** The chat's avatar (base64 PNG from the web app) cropped to a circle; null if absent or unreadable. */
    private static Bitmap decodeAvatar(String base64) {
        if (base64.isEmpty()) {
            return null;
        }
        try {
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            Bitmap source = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
            if (source == null) {
                return null;
            }
            Bitmap scaled = Bitmap.createScaledBitmap(source, ICON_SIZE_PX, ICON_SIZE_PX, true);
            Bitmap circle = Bitmap.createBitmap(ICON_SIZE_PX, ICON_SIZE_PX, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(circle);
            Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
            float half = ICON_SIZE_PX / 2f;
            canvas.drawCircle(half, half, half, paint);
            paint.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.SRC_IN));
            canvas.drawBitmap(scaled, 0, 0, paint);
            return circle;
        } catch (IllegalArgumentException | OutOfMemoryError e) {
            return null;
        }
    }

    /** A coloured circle with the chat's initial, so the targets are told apart at a glance. */
    private static Bitmap letterAvatar(String roomId, String label) {
        Bitmap bitmap = Bitmap.createBitmap(ICON_SIZE_PX, ICON_SIZE_PX, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);

        float hue = (roomId.hashCode() & 0x7fffffff) % 360;
        Paint circle = new Paint(Paint.ANTI_ALIAS_FLAG);
        circle.setColor(Color.HSVToColor(new float[] { hue, 0.55f, 0.75f }));
        float half = ICON_SIZE_PX / 2f;
        canvas.drawCircle(half, half, half, circle);

        String initial = new String(Character.toChars(label.codePointAt(0))).toUpperCase();
        Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
        text.setColor(Color.WHITE);
        text.setTextSize(ICON_SIZE_PX * 0.45f);
        text.setTextAlign(Paint.Align.CENTER);
        Rect bounds = new Rect();
        text.getTextBounds(initial, 0, initial.length(), bounds);
        canvas.drawText(initial, half, half + bounds.height() / 2f, text);

        return bitmap;
    }
}
