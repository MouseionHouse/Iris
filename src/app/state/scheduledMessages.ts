// Based on cinnyapp/cinny#2671 by jasonlaguidice.
import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';

/** The send time set in a room's composer: a send schedules the message for it. */
export const roomIdToScheduledTimeAtomFamily = atomFamily<
  string,
  ReturnType<typeof atom<number | undefined>>
>(() => atom<number | undefined>(undefined));

/**
 * The scheduled message a room's composer holds for editing. It stays scheduled until the edited
 * one is: then it is cancelled.
 */
export const roomIdToEditingScheduledAtomFamily = atomFamily<
  string,
  ReturnType<typeof atom<string | undefined>>
>(() => atom<string | undefined>(undefined));

/** The longest delay the server takes, once a too-far-ahead error has said. */
export const serverMaxDelayMsAtom = atom<number | undefined>(undefined);

/** Whether a room's list of scheduled messages is open. */
export const roomIdToScheduledListOpenAtomFamily = atomFamily<
  string,
  ReturnType<typeof atom<boolean>>
>(() => atom<boolean>(false));
