// Where scheduled messages live: the server's delayed events, or the mocks' in-memory store.
// Based on cinnyapp/cinny#2671 by jasonlaguidice.
import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { IContent, MatrixClient, Room } from 'matrix-js-sdk';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import {
  DelayedEvent,
  cancelDelayedEvent,
  decryptDelayedEvent,
  isScheduledMessage,
  listDelayedEvents,
  scheduleMessage,
  sendDelayedEventNow,
} from '../../../utils/delayedEvents';

export type ScheduledMessagesStore = {
  /** the account's scheduled delayed events, every room */
  list: () => Promise<DelayedEvent[]>;
  /** resolves with the delay id */
  schedule: (room: Room, content: IContent, delayMs: number) => Promise<string>;
  cancel: (delayId: string) => Promise<void>;
  sendNow: (delayId: string) => Promise<void>;
  /** sends a message at once (an edited scheduled message sent now) */
  send: (roomId: string, content: IContent) => Promise<void>;
  /** an encrypted one's clear content, when this device can read it */
  decrypt: (event: DelayedEvent) => Promise<IContent | undefined>;
};

export const createMatrixScheduledMessagesStore = (mx: MatrixClient): ScheduledMessagesStore => ({
  list: () => listDelayedEvents(mx),
  schedule: (room, content, delayMs) => scheduleMessage(mx, room, content, delayMs),
  cancel: (delayId) => cancelDelayedEvent(mx, delayId),
  sendNow: (delayId) => sendDelayedEventNow(mx, delayId),
  send: async (roomId, content) => {
    await mx.sendMessage(roomId, content as Parameters<MatrixClient['sendMessage']>[1]);
  },
  decrypt: (event) => decryptDelayedEvent(mx, event),
});

const ScheduledMessagesStoreContext = createContext<ScheduledMessagesStore | undefined>(undefined);

/** Swaps the server's delayed events for another store (the mock's in-memory one). */
export const ScheduledMessagesStoreProvider = ScheduledMessagesStoreContext.Provider;

export const useScheduledMessagesStore = (): ScheduledMessagesStore => {
  const provided = useContext(ScheduledMessagesStoreContext);
  const mx = useMatrixClient();
  return useMemo(() => provided ?? createMatrixScheduledMessagesStore(mx), [provided, mx]);
};

const QUERY_KEY = ['scheduledMessages'];
const REFETCH_INTERVAL = 60 * 1000;
/** after a row's send time, give the server a moment to have sent it */
const SEND_SLACK = 1500;

/** Refetches the list, after a change made here. */
export const useRefreshScheduledMessages = () => {
  const queryClient = useQueryClient();
  return useCallback(() => queryClient.invalidateQueries({ queryKey: QUERY_KEY }), [queryClient]);
};

/**
 * The room's scheduled messages, soonest first. The list refetches after a change made here, when
 * the page becomes visible, at the next one's send time, and every minute while mounted.
 */
export const useRoomScheduledMessages = (roomId: string, enabled: boolean) => {
  const store = useScheduledMessagesStore();
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => store.list(),
    enabled,
    refetchInterval: REFETCH_INTERVAL,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    staleTime: 5000,
  });
  const { refetch, data } = query;

  const messages = useMemo(
    () =>
      (data ?? [])
        .filter((e) => e.roomId === roomId && isScheduledMessage(e))
        .sort((a, b) => a.sendTs - b.sendTs),
    [data, roomId]
  );

  useEffect(() => {
    if (!enabled) return undefined;
    const onVisible = () => {
      if (document.visibilityState === 'visible') refetch();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [enabled, refetch]);

  const nextSendTs = messages.reduce<number | undefined>(
    (next, e) => (next === undefined || e.sendTs < next ? e.sendTs : next),
    undefined
  );
  useEffect(() => {
    if (!enabled || nextSendTs === undefined) return undefined;
    const wait = Math.max(0, nextSendTs - Date.now()) + SEND_SLACK;
    // further off than the minute's refetch: that one comes first
    if (wait > REFETCH_INTERVAL) return undefined;
    const timer = window.setTimeout(() => refetch(), wait);
    return () => window.clearTimeout(timer);
  }, [enabled, nextSendTs, refetch]);

  return { messages, query };
};

/**
 * What a scheduled message says: its content, or for an encrypted one the content decrypted on
 * this device. `content` is undefined while decrypting and when it can't be read here.
 */
export const useScheduledMessageContent = (event: DelayedEvent) => {
  const store = useScheduledMessagesStore();
  const encrypted = event.type === 'm.room.encrypted';
  const { data, isPending } = useQuery({
    queryKey: ['scheduledMessagePreview', event.delayId],
    queryFn: async () => (await store.decrypt(event)) ?? null,
    enabled: encrypted,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
  if (!encrypted) return { content: event.content, encrypted, decrypting: false };
  return { content: data ?? undefined, encrypted, decrypting: isPending };
};
