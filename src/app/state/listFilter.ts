import { atom } from 'jotai';

/*
 * The chip row above a conversation list on a phone. It belongs to the device and to this run of
 * the app: it is not synced and not stored, so a reload is back to All.
 */
export type ListFilter = 'all' | 'unreads' | 'mentions';

export const homeListFilterAtom = atom<ListFilter>('all');
export const directListFilterAtom = atom<ListFilter>('all');
