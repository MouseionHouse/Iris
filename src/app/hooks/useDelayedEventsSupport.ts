// Based on cinnyapp/cinny#2671 by jasonlaguidice.
import { useSpecVersions } from './useSpecVersions';
import { supportsDelayedEvents } from '../utils/delayedEvents';

/**
 * Whether the server holds and sends delayed events (MSC4140). Read from the /versions answer the
 * client already has, so a server without them costs no request.
 */
export const useDelayedEventsSupport = (): boolean => {
  const { unstable_features: unstableFeatures } = useSpecVersions();
  return supportsDelayedEvents(unstableFeatures);
};
