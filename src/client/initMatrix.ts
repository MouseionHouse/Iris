import { createClient, MatrixClient, IndexedDBStore, IndexedDBCryptoStore } from 'matrix-js-sdk';

import { cryptoCallbacks } from './secretStorageKeys';
import { clearNavToActivePathStore } from '../app/state/navToActivePath';
import { notifyHubSignedOut } from '../app/hub/hubBridge';
import { pushSessionToSW } from '../sw-session';
import { clearNativePushSession } from '../app/native/pushBridge';

type Session = {
  baseUrl: string;
  accessToken: string;
  userId: string;
  deviceId: string;
};

const isMismatchedAccount = (err: unknown): boolean =>
  err instanceof Error &&
  err.message.includes("the account in the store doesn't match the account in the constructor");

export const initClient = async (session: Session): Promise<MatrixClient> => {
  const indexedDBStore = new IndexedDBStore({
    indexedDB: global.indexedDB,
    localStorage: global.localStorage,
    dbName: 'web-sync-store',
  });

  const legacyCryptoStore = new IndexedDBCryptoStore(global.indexedDB, 'crypto-store');

  const mx = createClient({
    baseUrl: session.baseUrl,
    accessToken: session.accessToken,
    userId: session.userId,
    store: indexedDBStore,
    cryptoStore: legacyCryptoStore,
    deviceId: session.deviceId,
    timelineSupport: true,
    cryptoCallbacks: cryptoCallbacks as any,
    verificationMethods: ['m.sas.v1'],
  });

  await indexedDBStore.startup();
  try {
    await mx.initRustCrypto();
  } catch (err) {
    if (!isMismatchedAccount(err)) throw err;
    // The crypto store is left over from a different login of this account
    // (a session that ended without clearStores, or a login that never wiped
    // it): its keys belong to a device that is not this one, and the store
    // is named for the origin, not the device. Nothing in it can serve this
    // session, so drop it and start the crypto over for this device.
    await mx.clearStores({});
    await indexedDBStore.startup();
    await mx.initRustCrypto();
  }

  mx.setMaxListeners(50);

  return mx;
};

export const startClient = async (mx: MatrixClient) => {
  await mx.startClient({
    lazyLoadMembers: true,
  });
};

export const clearCacheAndReload = async (mx: MatrixClient) => {
  mx.stopClient();
  clearNavToActivePathStore(mx.getSafeUserId());
  await mx.store.deleteAllData();
  window.location.reload();
};

export const logoutClient = async (mx: MatrixClient) => {
  pushSessionToSW();
  await clearNativePushSession();
  mx.stopClient();
  try {
    await mx.logout();
  } catch {
    // ignore if failed to logout
  }
  await mx.clearStores();
  window.localStorage.clear();
  notifyHubSignedOut();
  window.location.reload();
};

export const clearLoginData = async () => {
  const dbs = await window.indexedDB.databases();

  dbs.forEach((idbInfo) => {
    const { name } = idbInfo;
    if (name) {
      window.indexedDB.deleteDatabase(name);
    }
  });

  window.localStorage.clear();
  notifyHubSignedOut();
  window.location.reload();
};
