/* eslint-disable import/first */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { enableMapSet } from 'immer';
import '@fontsource/inter/variable.css';
import 'folds/dist/style.css';
import { configClass, varsClass } from 'folds';

enableMapSet();

import './index.css';

import { trimTrailingSlash } from './app/utils/common';
import App from './app/pages/App';

// import i18n (needs to be bundled ;))
import './app/i18n';
import { pushSessionToSW, waitForSWControl } from './sw-session';
import { getFallbackSession } from './app/state/sessions';

document.body.classList.add(configClass, varsClass);

// Register Service Worker
let swRegistration: Promise<ServiceWorkerRegistration> | undefined;
if ('serviceWorker' in navigator) {
  // `PROD`, not `MODE === 'production'`: a `vite build --mode mobile` (the wrapper's bundle,
  // capacitor.config.ts) is still a production build, but its MODE is 'mobile'.
  const swUrl = import.meta.env.PROD
    ? `${trimTrailingSlash(import.meta.env.BASE_URL)}/sw.js`
    : `/dev-sw.js?dev-sw`;

  const sendSessionToSW = () => {
    const session = getFallbackSession();
    pushSessionToSW(session?.baseUrl, session?.accessToken);
  };

  swRegistration = navigator.serviceWorker.register(swUrl);
  swRegistration.then(sendSessionToSW);
  navigator.serviceWorker.ready.then(sendSessionToSW);
  // The session can only be pushed to a controller, so push again once there is one.
  navigator.serviceWorker.addEventListener('controllerchange', sendSessionToSW);

  navigator.serviceWorker.addEventListener('message', (ev) => {
    const { type } = ev.data ?? {};

    if (type === 'requestSession') {
      sendSessionToSW();
    }
  });
}

const mountApp = () => {
  const rootContainer = document.getElementById('root');

  if (rootContainer === null) {
    console.error('Root container element not found!');
    return;
  }

  const root = createRoot(rootContainer);
  root.render(<App />);
};

// Mount once media requests can be authenticated; see waitForSWControl.
waitForSWControl(swRegistration).finally(mountApp);
