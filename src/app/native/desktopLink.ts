/**
 * Where a `matrix:` link from the desktop shell goes. Kept free of imports from the app so it can be
 * unit tested on its own (`npm test`); `useDesktopOpenLink` supplies the lookups and navigates.
 *
 * It lands where a `matrix.to` link clicked inside Iris would (`useMentionClickHandler`): a room we
 * know opens like any room, one we do not goes to the home room path, where `JoinBeforeNavigate`
 * shows the room with its Join button (so `action=join` and "not a member" are the same thing), and
 * a user opens the direct-message page, which shows the existing conversation or offers to start one
 * (the profile's Message button).
 */
import type { DesktopLink } from './desktop';

export type KnownRoom = { roomId: string; isSpace: boolean };

export type LinkRoute =
  /** A room we have: open it (an invitation opens the invitations; see `useDesktopOpenRoom`). */
  | { to: 'room'; roomId: string; eventId?: string }
  | { to: 'space'; roomId: string }
  /** A room we are not in (or cannot resolve yet): the join page under Home. */
  | { to: 'join'; roomIdOrAlias: string; eventId?: string; viaServers?: string[] }
  | { to: 'direct'; userId: string };

export const routeDesktopLink = (
  link: DesktopLink,
  /** The room for an ID, or for an alias we know; undefined when we have no such room. */
  find: (roomIdOrAlias: string) => KnownRoom | undefined
): LinkRoute => {
  if (link.kind === 'user') return { to: 'direct', userId: link.id };
  const known = find(link.id);
  if (known) {
    return known.isSpace && !link.eventId
      ? { to: 'space', roomId: known.roomId }
      : { to: 'room', roomId: known.roomId, eventId: link.eventId };
  }
  return {
    to: 'join',
    roomIdOrAlias: link.id,
    eventId: link.eventId,
    viaServers: link.via && link.via.length > 0 ? link.via : undefined,
  };
};
