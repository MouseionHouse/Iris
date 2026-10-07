import { MatrixClient, SyncState } from 'matrix-js-sdk';
import React, { useCallback, useEffect, useState } from 'react';
import { Box, config, Line, Text } from 'folds';
import { useSyncState } from '../../hooks/useSyncState';
import { ContainerColor } from '../../styles/ContainerColor.css';

type StateData = {
  current: SyncState | null;
  previous: SyncState | null | undefined;
};

// A connection that comes back within this time is not worth a warning: returning to the app
// always drops the /sync poll for a moment (src/client/syncResume.ts).
const RECONNECTING_GRACE_MS = 1500;

type SyncStatusProps = {
  mx: MatrixClient;
};
export function SyncStatus({ mx }: SyncStatusProps) {
  const [stateData, setStateData] = useState<StateData>({
    current: null,
    previous: undefined,
  });

  useSyncState(
    mx,
    useCallback((current, previous) => {
      setStateData((s) => {
        if (s.current === current && s.previous === previous) {
          return s;
        }
        return { current, previous };
      });
    }, [])
  );

  const reconnecting = stateData.current === SyncState.Reconnecting;
  const [reconnectingLong, setReconnectingLong] = useState(false);
  useEffect(() => {
    if (!reconnecting) {
      setReconnectingLong(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setReconnectingLong(true), RECONNECTING_GRACE_MS);
    return () => window.clearTimeout(timer);
  }, [reconnecting]);

  // Upstream kept "Connecting..." until a second Syncing event; on a quiet server the next
  // /sync response only comes after the 30 s long poll, so the bar sat there for 30 s on every
  // load. The first Syncing state already means a sync completed: hide it then.
  if (stateData.current === SyncState.Prepared || stateData.current === SyncState.Catchup) {
    return (
      <Box direction="Column" shrink="No">
        <Box
          className={ContainerColor({ variant: 'Success' })}
          style={{ padding: `${config.space.S100} 0` }}
          alignItems="Center"
          justifyContent="Center"
        >
          <Text size="L400">Connecting...</Text>
        </Box>
        <Line variant="Success" size="300" />
      </Box>
    );
  }

  if (reconnecting && reconnectingLong) {
    return (
      <Box direction="Column" shrink="No">
        <Box
          className={ContainerColor({ variant: 'Warning' })}
          style={{ padding: `${config.space.S100} 0` }}
          alignItems="Center"
          justifyContent="Center"
        >
          <Text size="L400">Connection Lost! Reconnecting...</Text>
        </Box>
        <Line variant="Warning" size="300" />
      </Box>
    );
  }

  if (stateData.current === SyncState.Error) {
    return (
      <Box direction="Column" shrink="No">
        <Box
          className={ContainerColor({ variant: 'Critical' })}
          style={{ padding: `${config.space.S100} 0` }}
          alignItems="Center"
          justifyContent="Center"
        >
          <Text size="L400">Connection Lost!</Text>
        </Box>
        <Line variant="Critical" size="300" />
      </Box>
    );
  }

  return null;
}
