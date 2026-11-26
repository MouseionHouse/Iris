// The account data and state events Iris reads and writes beyond the ones matrix-js-sdk knows.
// matrix-js-sdk types getAccountData, setAccountData, sendStateEvent and the rest by these
// interfaces, so an event type missing here does not type-check. Add new ones here.
import type { SyncedDraft } from '../../app/state/room/draftSync';
import type { SealedDraftContent } from '../../app/state/room/sealedDrafts';
import type { SidebarSection } from '../../app/state/sidebar';
import type { InCinnySpacesContent } from '../../app/hooks/useSidebarItems';
import type { IRecentEmojiContent } from '../../app/plugins/recent-emoji';
import type { EmoteRoomsContent, PackContent } from '../../app/plugins/custom-emoji/types';
import type { PowerLevelTags } from '../../app/hooks/usePowerLevelTags';

declare module 'matrix-js-sdk/lib/@types/event' {
  interface AccountDataEvents {
    // AccountDataEvent.CinnySpaces
    'in.cinny.spaces': InCinnySpacesContent;
    // AccountDataEvent.ElementRecentEmoji
    'io.element.recent_emoji': IRecentEmojiContent;
    // AccountDataEvent.PoniesUserEmotes
    'im.ponies.user_emotes': PackContent;
    // AccountDataEvent.PoniesEmoteRooms
    'im.ponies.emote_rooms': EmoteRoomsContent;
    // SIDEBAR_EVENT_TYPE
    'house.mouseion.sidebar': { sections: SidebarSection[] };
  }

  interface RoomAccountDataEvents {
    // DRAFT_EVENT_TYPE: sealed in encrypted rooms
    'house.mouseion.draft': SyncedDraft | SealedDraftContent;
  }

  interface StateEvents {
    // StateEvent.PoniesRoomEmotes
    'im.ponies.room_emotes': PackContent;
    // StateEvent.PowerLevelTags
    'in.cinny.room.power_level_tags': PowerLevelTags;
  }
}
