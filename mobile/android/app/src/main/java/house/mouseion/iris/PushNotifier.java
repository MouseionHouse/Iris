package house.mouseion.iris;

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
import android.service.notification.StatusBarNotification;
import androidx.core.app.NotificationCompat;
import androidx.core.app.Person;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
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

    static final String EXTRA_ROOM_ID = "house.mouseion.iris.ROOM_ID";

    // Heads-up popups need an IMPORTANCE_HIGH channel, and a channel's importance cannot be raised
    // once it exists: the first "messages" channel (IMPORTANCE_DEFAULT) is replaced, not changed.
    private static final String CHANNEL_MESSAGES = "messages.popup";
    private static final String CHANNEL_MESSAGES_OLD = "messages";
    private static final String GROUP = "house.mouseion.iris.messages";
    private static final int SUMMARY_ID = 0;

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

        switch (PushHistory.actionOf(roomId, eventId, unread)) {
            case CLEAR_ALL:
                clearShown(app);
                return;
            case IGNORE:
                return;
            default:
                break;
        }

        long receivedAt = System.currentTimeMillis();
        WORKER.execute(() -> {
            PushSummary summary = summarise(app, roomId, eventId);
            if (summary == null) return;
            // The room was read while the fetch was being retried: its clearing push came first.
            SharedPreferences prefs = PushStore.prefs(app);
            if (Math.max(prefs.getLong(clearedKey(roomId), 0L), prefs.getLong(KEY_CLEARED_ALL, 0L)) >= receivedAt) return;
            // The app is on screen: its own unread badges show the message, no shade entry needed.
            if (MouseionPushPlugin.isAppVisible()) return;
            post(app, summary, eventId, unread, PushSummary.playsSound(priority, PushStore.soundEnabled(app)));
        });
    }

    static void clearRoom(Context context, String roomId) {
        PushStore.prefs(context).edit().putLong(clearedKey(roomId), System.currentTimeMillis()).remove(historyKey(roomId)).apply();
        NotificationManager manager = manager(context);
        manager.cancel(roomId.hashCode());
        if (roomsWithHistory(context).isEmpty()) manager.cancel(SUMMARY_ID);
    }

    /** Everything was read: the shade empties, the session stays. */
    private static void clearShown(Context context) {
        SharedPreferences.Editor editor = PushStore.prefs(context).edit().putLong(KEY_CLEARED_ALL, System.currentTimeMillis());
        for (String roomId : roomsWithHistory(context)) editor.remove(historyKey(roomId));
        editor.apply();
        manager(context).cancelAll();
    }

    /** The app is on screen and in sync: rooms it no longer counts as unread leave the shade. */
    static void setUnreadRooms(Context context, Collection<String> unreadRooms) {
        for (String roomId : PushHistory.read(roomsWithHistory(context), unreadRooms)) clearRoom(context, roomId);
    }

    /** Signed out: nothing from the old session stays on the shade or in prefs. */
    static void clearAll(Context context) {
        SharedPreferences.Editor editor = PushStore.prefs(context).edit();
        for (String key : PushStore.prefs(context).getAll().keySet()) {
            if (key.startsWith("hist:") || key.startsWith("cleared:") || key.equals(KEY_CLEARED_ALL)) editor.remove(key);
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

    private static void post(Context context, PushSummary summary, String eventId, int unread, boolean sound) {
        if (
            Build.VERSION.SDK_INT >= 33 &&
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return;
        NotificationManager manager = manager(context);
        createChannel(context);

        int id = summary.roomId.hashCode();
        Intent open = new Intent(context, MainActivity.class)
            .putExtra(EXTRA_ROOM_ID, summary.roomId)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(context, id, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        // One conversation per room. The lines come from prefs rather than the showing notification
        // (the process is usually cold for every push, and the system does not hand back a collapsed
        // group's messages), but only while that notification is still on the shade (PushHistory).
        long now = System.currentTimeMillis();
        Set<Integer> showing = showingIds(manager);
        forgetDismissed(context, showing, summary.roomId, now);
        List<PushHistory.Line> lines = PushHistory.next(
            readHistory(context, summary.roomId),
            showing == null || showing.contains(id),
            new PushHistory.Line(eventId, summary.body, summary.senderName, now)
        );
        PushStore.prefs(context).edit().putString(historyKey(summary.roomId), PushHistory.serialise(lines)).apply();
        NotificationCompat.MessagingStyle style = new NotificationCompat.MessagingStyle(new Person.Builder().setName("You").build())
            .setConversationTitle(summary.isGroup ? summary.title : null)
            .setGroupConversation(summary.isGroup);
        for (PushHistory.Line line : lines) {
            style.addMessage(line.text, line.at, new Person.Builder().setName(line.sender).build());
        }

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
        int rooms = roomsWithHistory(context).size();
        String roomsText = rooms == 1 ? "1 room" : rooms + " rooms";
        Intent launch = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        manager.notify(
            SUMMARY_ID,
            new NotificationCompat.Builder(context, CHANNEL_MESSAGES)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle("Iris")
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

    /**
     * The message channel: pops up on screen (silent notifications still do not). Created at app
     * start too, so Android's settings list it before the first message.
     */
    static void createChannel(Context context) {
        NotificationManager manager = manager(context);
        manager.createNotificationChannel(new NotificationChannel(CHANNEL_MESSAGES, "Messages", NotificationManager.IMPORTANCE_HIGH));
        manager.deleteNotificationChannel(CHANNEL_MESSAGES_OLD);
    }

    private static NotificationManager manager(Context context) {
        return (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    }

    // Per-room history: "hist:<roomId>" → PushHistory.serialise.
    private static String historyKey(String roomId) {
        return "hist:" + roomId;
    }

    // When a room was last cleared because it was read: "cleared:<roomId>" → epoch ms.
    private static String clearedKey(String roomId) {
        return "cleared:" + roomId;
    }

    // When everything was last cleared because nothing was unread any more → epoch ms.
    private static final String KEY_CLEARED_ALL = "clearedAll";

    private static List<PushHistory.Line> readHistory(Context context, String roomId) {
        return PushHistory.parse(PushStore.prefs(context).getString(historyKey(roomId), null));
    }

    private static Set<String> roomsWithHistory(Context context) {
        Set<String> rooms = new HashSet<>();
        for (String key : PushStore.prefs(context).getAll().keySet()) {
            if (key.startsWith("hist:")) rooms.add(key.substring("hist:".length()));
        }
        return rooms;
    }

    /** The ids of this app's notifications on the shade, or null when Android will not say. */
    private static Set<Integer> showingIds(NotificationManager manager) {
        try {
            Set<Integer> ids = new HashSet<>();
            for (StatusBarNotification shown : manager.getActiveNotifications()) ids.add(shown.getId());
            return ids;
        } catch (RuntimeException e) {
            return null;
        }
    }

    /** Drops the history of the other rooms whose notification the user dismissed or opened. */
    private static void forgetDismissed(Context context, Set<Integer> showing, String currentRoomId, long now) {
        if (showing == null) return;
        SharedPreferences.Editor editor = PushStore.prefs(context).edit();
        for (String roomId : roomsWithHistory(context)) {
            if (roomId.equals(currentRoomId)) continue;
            if (!PushHistory.live(readHistory(context, roomId), showing.contains(roomId.hashCode()), now)) editor.remove(historyKey(roomId));
        }
        editor.apply();
    }
}
