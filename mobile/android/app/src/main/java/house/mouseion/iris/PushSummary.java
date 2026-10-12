package house.mouseion.iris;

import org.json.JSONObject;

/**
 * What a pushed event looks like on the notification shade, from the raw Matrix event JSON.
 * Pure (no Android or network), so the rules are unit-tested (PushSummaryTest).
 */
final class PushSummary {

    /** Waits between attempts to fetch a pushed event (the network is often still waking up). */
    static final long[] FETCH_RETRY_DELAYS_MS = { 2_000L, 5_000L, 10_000L, 20_000L };

    final String roomId;
    final String title;
    final String senderName;
    final String body;
    final boolean isGroup;

    PushSummary(String roomId, String title, String senderName, String body, boolean isGroup) {
        this.roomId = roomId;
        this.title = title;
        this.senderName = senderName;
        this.body = body;
        this.isGroup = isGroup;
    }

    /** "New message" in a room whose event could not be fetched: better than silence. */
    static PushSummary fallback(String roomId, String roomName) {
        String title = roomName != null ? roomName : "Iris";
        return new PushSummary(roomId, title, title, "New message", roomName != null);
    }

    /**
     * The summary for [event]. A named room is a group conversation titled by its name; an unnamed
     * room (a direct chat) is titled by the sender, as Cinny names it.
     */
    static PushSummary of(String roomId, String roomName, String senderName, JSONObject event, String myUserId) {
        String title = roomName != null ? roomName : senderName;
        return new PushSummary(roomId, title, senderName, bodyOf(event, myUserId), roomName != null);
    }

    /** One line of text for [event]: its body without the reply fallback, or a short description. */
    static String bodyOf(JSONObject event, String myUserId) {
        String type = event.optString("type", "");
        JSONObject content = event.optJSONObject("content");
        if (content == null || content.length() == 0) return "Message deleted";
        switch (type) {
            case "m.room.message": {
                String msgtype = content.optString("msgtype", "");
                if ("m.image".equals(msgtype)) return "🖼 image";
                if ("m.video".equals(msgtype)) return "🎞 video";
                if ("m.audio".equals(msgtype)) return "🔊 audio";
                if ("m.file".equals(msgtype)) return "📎 " + content.optString("body", "file");
                String line = firstLine(trimReplyFallback(content.optString("body", "")));
                if ("m.emote".equals(msgtype)) return "* " + line;
                return line.isEmpty() ? "New message" : line;
            }
            case "m.sticker":
                return "Sticker: " + content.optString("body", "");
            case "m.room.member":
                if ("invite".equals(content.optString("membership")) && myUserId != null && myUserId.equals(event.optString("state_key"))) {
                    return "Invited you";
                }
                return "New message";
            default:
                return "New message";
        }
    }

    /** Matrix reply fallback: leading "> " lines and the blank line after them. */
    static String trimReplyFallback(String body) {
        if (!body.startsWith("> ")) return body;
        String[] lines = body.split("\n", -1);
        int i = 0;
        while (i < lines.length && lines[i].startsWith(">")) i++;
        while (i < lines.length && lines[i].isEmpty()) i++;
        StringBuilder rest = new StringBuilder();
        for (int j = i; j < lines.length; j++) {
            if (j > i) rest.append('\n');
            rest.append(lines[j]);
        }
        return rest.toString();
    }

    private static String firstLine(String text) {
        String trimmed = text.trim();
        int newline = trimmed.indexOf('\n');
        String line = newline >= 0 ? trimmed.substring(0, newline) : trimmed;
        return line.length() > 120 ? line.substring(0, 120) : line;
    }

    /** A fetch failure that retrying cannot change: the server answered 4xx (the event is gone). */
    static boolean isFinalFetchStatus(int status) {
        return status >= 400 && status < 500 && status != 429;
    }

    /**
     * Whether the notification makes a sound: "Notification Sound" is on and the push rule that
     * matched asked for one. Synapse leaves tweaks out of event_id_only pushes but sends prio "high"
     * exactly when they hold a sound or highlight, so "Notify Silent" stays silent.
     */
    static boolean playsSound(String priority, boolean soundsOn) {
        return soundsOn && "high".equals(priority);
    }
}
