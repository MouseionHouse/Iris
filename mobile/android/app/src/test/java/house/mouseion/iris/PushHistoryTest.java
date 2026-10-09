package house.mouseion.iris;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import org.junit.Test;

public class PushHistoryTest {

    private static final long NOW = 1_000_000L;

    private static PushHistory.Line line(String eventId, String text, long at) {
        return new PushHistory.Line(eventId, text, "Andromache", at);
    }

    private static List<String> texts(List<PushHistory.Line> lines) {
        List<String> texts = new ArrayList<>();
        for (PushHistory.Line line : lines) texts.add(line.text);
        return texts;
    }

    @Test
    public void aShowingNotificationKeepsItsEarlierLines() {
        List<PushHistory.Line> stored = Arrays.asList(line("$1", "dinner?", NOW - 60_000));
        List<PushHistory.Line> lines = PushHistory.next(stored, true, line("$2", "at 7", NOW));
        assertEquals(Arrays.asList("dinner?", "at 7"), texts(lines));
    }

    /** The bug: lines the user had already dismissed (or opened) came back with the next message. */
    @Test
    public void aNotificationThatIsGoneStartsOver() {
        List<PushHistory.Line> stored = Arrays.asList(line("$1", "dinner?", NOW - 60_000));
        List<PushHistory.Line> lines = PushHistory.next(stored, false, line("$2", "at 7", NOW));
        assertEquals(Collections.singletonList("at 7"), texts(lines));
    }

    /** Android lists a notification a moment after notify(): a burst must not lose its first line. */
    @Test
    public void aLineJustPostedCountsAsShowing() {
        List<PushHistory.Line> stored = Arrays.asList(line("$1", "dinner?", NOW - 500));
        List<PushHistory.Line> lines = PushHistory.next(stored, false, line("$2", "at 7", NOW));
        assertEquals(Arrays.asList("dinner?", "at 7"), texts(lines));
    }

    @Test
    public void aRedeliveredEventReplacesItsLine() {
        List<PushHistory.Line> stored = Arrays.asList(line("$1", "dinner?", NOW - 60_000), line("$2", "at 7", NOW - 30_000));
        List<PushHistory.Line> lines = PushHistory.next(stored, true, line("$1", "dinner?", NOW));
        assertEquals(Arrays.asList("at 7", "dinner?"), texts(lines));
    }

    @Test
    public void onlyTheLastLinesAreKept() {
        List<PushHistory.Line> stored = new ArrayList<>();
        for (int i = 0; i < PushHistory.MAX_LINES; i++) stored.add(line("$" + i, "m" + i, NOW - 60_000));
        List<PushHistory.Line> lines = PushHistory.next(stored, true, line("$new", "new", NOW));
        assertEquals(PushHistory.MAX_LINES, lines.size());
        assertEquals("m1", lines.get(0).text);
        assertEquals("new", lines.get(lines.size() - 1).text);
    }

    @Test
    public void linesSurviveStorage() {
        List<PushHistory.Line> lines = Arrays.asList(line("$1", "dinner?", NOW - 1), line("$2", "at 7", NOW));
        List<PushHistory.Line> read = PushHistory.parse(PushHistory.serialise(lines));
        assertEquals(Arrays.asList("dinner?", "at 7"), texts(read));
        assertEquals("$2", read.get(1).eventId);
        assertEquals("Andromache", read.get(1).sender);
        assertEquals(NOW, read.get(1).at);
        assertTrue(PushHistory.parse("not json").isEmpty());
        assertTrue(PushHistory.parse(null).isEmpty());
    }

    @Test
    public void roomsNoLongerUnreadAreCleared() {
        HashSet<String> shown = new HashSet<>(Arrays.asList("!a:x", "!b:x"));
        assertEquals(Collections.singleton("!a:x"), PushHistory.read(shown, Collections.singletonList("!b:x")));
    }

    /** Synapse's badge-only push after a read receipt has no room: unread 0 means all is read. */
    @Test
    public void aPushSaysWhatToDo() {
        assertEquals(PushHistory.Action.SHOW, PushHistory.actionOf("!a:x", "$1", 2));
        assertEquals(PushHistory.Action.SHOW, PushHistory.actionOf("!a:x", "$1", -1));
        assertEquals(PushHistory.Action.CLEAR_ALL, PushHistory.actionOf("", "", 0));
        assertEquals(PushHistory.Action.CLEAR_ALL, PushHistory.actionOf("!a:x", "$1", 0));
        assertEquals(PushHistory.Action.IGNORE, PushHistory.actionOf("", "", 3));
    }
}
