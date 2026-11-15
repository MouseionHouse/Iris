import { useState, useCallback } from 'react';
import type { AccountDataEvents } from 'matrix-js-sdk/lib/types';
import { useMatrixClient } from './useMatrixClient';
import { useAccountDataCallback } from './useAccountDataCallback';

// Takes any string: the app's AccountDataEvent enum shares its values with matrix-js-sdk's EventType,
// but TypeScript does not count one enum's member as the other's.
export function useAccountData(eventType: string) {
  const mx = useMatrixClient();
  const [event, setEvent] = useState(() => mx.getAccountData(eventType as keyof AccountDataEvents));

  useAccountDataCallback(
    mx,
    useCallback(
      (evt) => {
        if (evt.getType() === eventType) {
          setEvent(evt);
        }
      },
      [eventType, setEvent]
    )
  );

  return event;
}
