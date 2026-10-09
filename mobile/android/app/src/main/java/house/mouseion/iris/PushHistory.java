package house.mouseion.iris;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Which lines a room's notification carries, and when they are dropped. Pure (no Android), so the
 * rules are unit-tested (PushHistoryTest).
 *
 * The lines are kept in prefs because the process is usually cold for every push. They only
 * belong to the notification while it is on the shade: once the user dismissed it, opened it or
 * read the room, the next message starts a new one.
 */
final class PushHistory {

    static final int MAX_LINES = 8;

    /** Android lists a notification a moment after notify(); a line this young counts as showing. */
    static final long JUST_POSTED_MS = 5_000L;

    enum Action {
        /** Fetch the event and show it. */
        SHOW,
        /** Nothing is unread any more (read here or on another device): clear the shade. */
        CLEAR_ALL,
        IGNORE,
    }

    static final class Line {

        final String eventId;
        final String text;
        final String sender;
        final long at;

        Line(String eventId, String text, String sender, long at) {
            this.eventId = eventId;
            this.text = text;
            this.sender = sender;
            this.at = at;
        }
    }

    private PushHistory() {}

    /**
     * What a push asks for. `unread` is the account's badge count, not the room's, and Synapse's
     * badge-only push after a read receipt names no room or event: only 0 says something certain.
     */
    static Action actionOf(String roomId, String eventId, int unread) {
        if (unread == 0) return Action.CLEAR_ALL;
        if (roomId.isEmpty() || eventId.isEmpty()) return Action.IGNORE;
        return Action.SHOW;
    }

    /** Whether `stored` still belongs to a notification on the shade. */
    static boolean live(List<Line> stored, boolean showing, long now) {
        return showing || (!stored.isEmpty() && now - stored.get(stored.size() - 1).at < JUST_POSTED_MS);
    }

    /**
     * The lines of a room's notification once `incoming` arrived. `stored` only carries over while
     * the notification is still `showing`; an event delivered twice keeps one line.
     */
    static List<Line> next(List<Line> stored, boolean showing, Line incoming) {
        List<Line> lines = new ArrayList<>();
        if (live(stored, showing, incoming.at)) {
            for (Line line : stored) {
                if (!line.eventId.isEmpty() && line.eventId.equals(incoming.eventId)) continue;
                lines.add(line);
            }
        }
        lines.add(incoming);
        return new ArrayList<>(lines.subList(Math.max(0, lines.size() - MAX_LINES), lines.size()));
    }

    /** The rooms with a notification that the app reports as no longer unread. */
    static Set<String> read(Set<String> shownRooms, Collection<String> unreadRooms) {
        Set<String> read = new HashSet<>(shownRooms);
        read.removeAll(unreadRooms);
        return read;
    }

    static String serialise(List<Line> lines) {
        JSONArray array = new JSONArray();
        try {
            for (Line line : lines) {
                array.put(new JSONObject().put("e", line.eventId).put("t", line.text).put("s", line.sender).put("m", line.at));
            }
        } catch (Exception ignored) {
            // History is context only.
        }
        return array.toString();
    }

    static List<Line> parse(String raw) {
        List<Line> lines = new ArrayList<>();
        if (raw == null) return lines;
        try {
            JSONArray array = new JSONArray(raw);
            for (int i = 0; i < array.length(); i++) {
                JSONObject line = array.getJSONObject(i);
                lines.add(new Line(line.optString("e", ""), line.optString("t", ""), line.optString("s", ""), line.optLong("m")));
            }
        } catch (Exception ignored) {
            // A corrupt entry only loses the older lines.
        }
        return lines;
    }
}
