import { useCrossSigningActive } from './useCrossSigning';
import { useDeviceIds, useDeviceList, useSplitCurrentDevice } from './useDeviceList';
import {
  useDeviceVerificationStatus,
  useUnverifiedDeviceCount,
  VerificationStatus,
} from './useDeviceVerificationStatus';
import { useMatrixClient } from './useMatrixClient';

export type UnverifiedDevices = {
  /** This device is the unverified one. */
  current: boolean;
  /** How many of the user's other devices are unverified. */
  others: number;
};

/**
 * The warning about unverified devices, shown by the rail's shield and by the You tab of a
 * phone. Undefined when there is nothing to warn about, or no cross-signing to verify against.
 */
export const useUnverifiedDevices = (): UnverifiedDevices | undefined => {
  const mx = useMatrixClient();
  const crossSigningActive = useCrossSigningActive();

  const crypto = mx.getCrypto();
  const [devices] = useDeviceList();

  const [currentDevice, otherDevices] = useSplitCurrentDevice(devices);

  const verificationStatus = useDeviceVerificationStatus(
    crypto,
    mx.getSafeUserId(),
    currentDevice?.device_id
  );
  const current = verificationStatus === VerificationStatus.Unverified;

  const otherDevicesId = useDeviceIds(otherDevices);
  const others = useUnverifiedDeviceCount(crypto, mx.getSafeUserId(), otherDevicesId) ?? 0;

  if (!crossSigningActive || !(current || others > 0)) return undefined;
  return { current, others };
};
