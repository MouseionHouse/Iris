package house.mouseion.chat;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.Person;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Turns a push (event_id_only, via ntfy) into a notification: fetches the event with the stored
 * session and posts one conversation-style notification per room.
 *
 * The UnifiedPush connector binds the push service only while it hands over one event, so the
 * work runs on this process-wide single thread, never tied to the service's lifetime (the Compose
 * app lost registrations and notifications that way, WORKTRACK 2026-09-16).
 */
final class PushNotifier {

    static final String EXTRA_ROOM_ID = "house.mouseion.chat.ROOM_ID";

    private static final String CHANNEL_MESSAGES = "messages";
    private static final String GROUP = "house.mouseion.chat.messages";
    private static final int SUMMARY_ID = 0;
    private static final int MAX_MESSAGES = 8;

    private static final ExecutorService WORKER = Executors.newSingleThreadExecutor();

    private PushNotifier() {}

    /** Handles one push payload: {"notification": {event_id, room_id, counts, prio}}. */
    static void onPush(Context context, String payload) {
        Context app = context.getApplicationContext();
        JSONObject notification;
        try {
            notification = new JSONObject(payload).optJSONObject("notification");
        } catch (Exception e) {
            return;
        }
        if (notification == null) return;
        String roomId = notification.optString("room_id", "");
        String eventId = notification.optString("event_id", "");
        JSONObject counts = notification.optJSONObject("counts");
        int unread = counts != null ? counts.optInt("unread", -1) : -1;
        String priority = notification.optString("prio", "");

        if (!roomId.isEmpty() && unread == 0) {
            // The room was read (here or on another device): clear what we showed for it.
            clearRoom(app, roomId);
            return;
        }
        if (roomId.isEmpty() || eventId.isEmpty()) return;

        long receivedAt = System.currentTimeMillis();
        WORKER.execute(() -> {
            PushSummary summary = summarise(app, roomId, eventId);
            if (summary == null) return;
            // The room was read while the fetch was being retried: its clearing push came first.
            if (PushStore.prefs(app).getLong(clearedKey(roomId), 0L) >= receivedAt) return;
            // The app is on screen: its own unread badges show the message, no shade entry needed.
            if (MouseionPushPlugin.isAppVisible()) return;
            post(app, summary, unread, PushSummary.playsSound(priority, PushStore.soundEnabled(app)));
        });
    }

    static void clearRoom(Context context, String roomId) {
        PushStore.prefs(context).edit().putLong(clearedKey(roomId), System.currentTimeMillis()).remove(historyKey(roomId)).apply();
        NotificationManager manager = manager(context);
        manager.cancel(roomId.hashCode());
        if (roomsWithHistory(context) == 0) manager.cancel(SUMMARY_ID);
    }

    /** Signed out: nothing from the old session stays on the shade or in prefs. */
    static void clearAll(Context context) {
        SharedPreferences.Editor editor = PushStore.prefs(context).edit();
        for (String key : PushStore.prefs(context).getAll().keySet()) {
            if (key.startsWith("hist:") || key.startsWith("cleared:")) editor.remove(key);
        }
        editor.apply();
        manager(context).cancelAll();
    }

    private static PushSummary summarise(Context context, String roomId, String eventId) {
        PushStore.Session session = PushStore.session(context);
        if (session == null) return null;
        for (int attempt = 0; attempt <= PushSummary.FETCH_RETRY_DELAYS_MS.length; attempt++) {
            if (attempt > 0) {
                try {
                    Thread.sleep(PushSummary.FETCH_RETRY_DELAYS_MS[attempt - 1]);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    return null;
                }
            }
            try {
                JSONObject event = get(session, "/rooms/" + enc(roomId) + "/event/" + enc(eventId));
                String sender = event.optString("sender", "");
                return PushSummary.of(roomId, roomName(session, roomId), memberName(session, roomId, sender), event, session.userId);
            } catch (HttpError e) {
                if (PushSummary.isFinalFetchStatus(e.status)) return null;
            } catch (Exception e) {
                // Network not up yet, or a 5xx: retry.
            }
        }
        String name = null;
        try {
            name = roomName(session, roomId);
        } catch (Exception ignored) {
            // Offline: the generic fallback below still names the app.
        }
        return PushSummary.fallback(roomId, name);
    }

    private static String roomName(PushStore.Session session, String roomId) throws Exception {
        try {
            String name = get(session, "/rooms/" + enc(roomId) + "/state/m.room.name/").optString("name", "");
            return name.isEmpty() ? null : name;
        } catch (HttpError e) {
            if (e.status == 404) return null;
            throw e;
        }
    }

    private static String memberName(PushStore.Session session, String roomId, String userId) {
        try {
            String name = get(session, "/rooms/" + enc(roomId) + "/state/m.room.member/" + enc(userId)).optString("displayname", "");
            if (!name.isEmpty()) return name;
        } catch (Exception ignored) {
            // Fall back to the localpart.
        }
        int colon = userId.indexOf(':');
        return userId.startsWith("@") && colon > 1 ? userId.substring(1, colon) : userId;
    }

    private static final class HttpError extends IOException {

        final int status;

        HttpError(int status) {
            super("HTTP " + status);
            this.status = status;
        }
    }

    private static JSONObject get(PushStore.Session session, String path) throws Exception {
        String base = session.baseUrl.endsWith("/") ? session.baseUrl.substring(0, session.baseUrl.length() - 1) : session.baseUrl;
        HttpURLConnection connection = (HttpURLConnection) new URL(base + "/_matrix/client/v3" + path).openConnection();
        connection.setConnectTimeout(10_000);
        connection.setReadTimeout(10_000);
        connection.setRequestProperty("Authorization", "Bearer " + session.accessToken);
        try {
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) throw new HttpError(status);
            try (InputStream in = connection.getInputStream()) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buffer = new byte[8192];
                int read;
                while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
                return new JSONObject(out.toString(StandardCharsets.UTF_8.name()));
            }
        } finally {
            connection.disconnect();
        }
    }

    private static String enc(String segment) {
        return Uri.encode(segment);
    }

    private static void post(Context context, PushSummary summary, int unread, boolean sound) {
        if (
            Build.VERSION.SDK_INT >= 33 &&
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return;
        NotificationManager manager = manager(context);
        manager.createNotificationChannel(new NotificationChannel(CHANNEL_MESSAGES, "Messages", NotificationManager.IMPORTANCE_DEFAULT));

        int id = summary.roomId.hashCode();
        Intent open = new Intent(context, MainActivity.class)
            .putExtra(EXTRA_ROOM_ID, summary.roomId)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(context, id, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        // One conversation per room, keeping the last MAX_MESSAGES lines. The lines come from prefs
        // rather than the showing notification: the process is usually cold for every push, and the
        // system does not hand back a collapsed group's messages.
        List<JSONObject> history = readHistory(context, summary.roomId);
        NotificationCompat.MessagingStyle style = new NotificationCompat.MessagingStyle(new Person.Builder().setName("You").build())
            .setConversationTitle(summary.isGroup ? summary.title : null)
            .setGroupConversation(summary.isGroup);
        int skip = Math.max(0, history.size() - (MAX_MESSAGES - 1));
        for (JSONObject line : history.subList(skip, history.size())) {
            style.addMessage(line.optString("t"), line.optLong("m"), new Person.Builder().setName(line.optString("s", "")).build());
        }
        long now = System.currentTimeMillis();
        style.addMessage(summary.body, now, new Person.Builder().setName(summary.senderName).build());
        writeHistory(context, summary.roomId, history, summary.body, summary.senderName, now);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_MESSAGES)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(summary.title)
            .setContentText(summary.isGroup ? summary.senderName + ": " + summary.body : summary.body)
            .setStyle(style)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setAutoCancel(true)
            .setSilent(!sound)
            .setGroup(GROUP)
            .setContentIntent(tap);
        // The launcher badge shows the room's unread count from the push.
        if (unread > 0) builder.setNumber(unread);
        manager.notify(id, builder.build());

        // Several rooms collapse into one shade entry; only the room's own notification alerts.
        int rooms = roomsWithHistory(context);
        String roomsText = rooms == 1 ? "1 room" : rooms + " rooms";
        Intent launch = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        manager.notify(
            SUMMARY_ID,
            new NotificationCompat.Builder(context, CHANNEL_MESSAGES)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle("Mouseion Chat")
                .setContentText(roomsText)
                .setStyle(new NotificationCompat.InboxStyle().setSummaryText(roomsText))
                .setGroup(GROUP)
                .setGroupSummary(true)
                .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_CHILDREN)
                .setAutoCancel(true)
                .setContentIntent(PendingIntent.getActivity(context, SUMMARY_ID, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE))
                .build()
        );
    }

    private static NotificationManager manager(Context context) {
        return (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    }

    // Per-room history: "hist:<roomId>" → [{"t": text, "s": sender, "m": epochMs}].
    private static String historyKey(String roomId) {
        return "hist:" + roomId;
    }

    // When a room was last cleared because it was read: "cleared:<roomId>" → epoch ms.
    private static String clearedKey(String roomId) {
        return "cleared:" + roomId;
    }

    private static List<JSONObject> readHistory(Context context, String roomId) {
        List<JSONObject> lines = new ArrayList<>();
        String raw = PushStore.prefs(context).getString(historyKey(roomId), null);
        if (raw == null) return lines;
        try {
            JSONArray array = new JSONArray(raw);
            for (int i = 0; i < array.length(); i++) lines.add(array.getJSONObject(i));
        } catch (Exception ignored) {
            // A corrupt entry only loses the older lines.
        }
        return lines;
    }

    private static void writeHistory(Context context, String roomId, List<JSONObject> previous, String text, String sender, long at) {
        try {
            JSONArray array = new JSONArray();
            int skip = Math.max(0, previous.size() + 1 - MAX_MESSAGES);
            for (JSONObject line : previous.subList(skip, previous.size())) array.put(line);
            array.put(new JSONObject().put("t", text).put("s", sender).put("m", at));
            PushStore.prefs(context).edit().putString(historyKey(roomId), array.toString()).apply();
        } catch (Exception ignored) {
            // History is context only; the notification itself was posted.
        }
    }

    private static int roomsWithHistory(Context context) {
        int count = 0;
        for (Map.Entry<String, ?> entry : PushStore.prefs(context).getAll().entrySet()) {
            if (entry.getKey().startsWith("hist:")) count++;
        }
        return count;
    }
}
