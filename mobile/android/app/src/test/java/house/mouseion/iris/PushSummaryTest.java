package house.mouseion.iris;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.json.JSONObject;
import org.junit.Test;

public class PushSummaryTest {

    private static JSONObject message(String msgtype, String body) throws Exception {
        return new JSONObject()
            .put("type", "m.room.message")
            .put("sender", "@andromache:example.org")
            .put("content", new JSONObject().put("msgtype", msgtype).put("body", body));
    }

    @Test
    public void textBodyIsItsFirstLineWithoutTheReplyFallback() throws Exception {
        JSONObject event = message("m.text", "> <@hector:example.org> dinner?\n> second\n\nyes please\nat 7");
        assertEquals("yes please", PushSummary.bodyOf(event, "@hector:example.org"));
    }

    @Test
    public void mediaAndEmptyContentGetShortDescriptions() throws Exception {
        assertEquals("🖼 image", PushSummary.bodyOf(message("m.image", "IMG_1.jpg"), null));
        assertEquals("* waves", PushSummary.bodyOf(message("m.emote", "waves"), null));
        JSONObject redacted = new JSONObject().put("type", "m.room.message").put("content", new JSONObject());
        assertEquals("Message deleted", PushSummary.bodyOf(redacted, null));
    }

    @Test
    public void inviteToMeSaysSo() throws Exception {
        JSONObject invite = new JSONObject()
            .put("type", "m.room.member")
            .put("state_key", "@hector:example.org")
            .put("content", new JSONObject().put("membership", "invite"));
        assertEquals("Invited you", PushSummary.bodyOf(invite, "@hector:example.org"));
    }

    @Test
    public void namedRoomIsAGroupAndUnnamedIsTitledBySender() throws Exception {
        PushSummary group = PushSummary.of("!r", "Kitchen", "Andromache", message("m.text", "hi"), null);
        assertTrue(group.isGroup);
        assertEquals("Kitchen", group.title);
        PushSummary direct = PushSummary.of("!d", null, "Andromache", message("m.text", "hi"), null);
        assertFalse(direct.isGroup);
        assertEquals("Andromache", direct.title);
    }

    @Test
    public void onlyClientErrorsOtherThanRateLimitsAreFinal() {
        assertTrue(PushSummary.isFinalFetchStatus(404));
        assertTrue(PushSummary.isFinalFetchStatus(403));
        assertFalse(PushSummary.isFinalFetchStatus(429));
        assertFalse(PushSummary.isFinalFetchStatus(502));
    }

    @Test
    public void soundNeedsTheSettingAndAHighPriorityPush() {
        assertTrue(PushSummary.playsSound("high", true));
        assertFalse(PushSummary.playsSound("high", false));
        assertFalse(PushSummary.playsSound("low", true));
        assertFalse(PushSummary.playsSound("", true));
    }
}
