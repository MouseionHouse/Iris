// Builds window.irisDesktop on top of the QWebChannel object of the same name.
// Methods return promises; on(event, handler) returns a function that removes the handler.
var handlers = {};
var latest = {};
// Only state (the colour scheme) is replayed to a handler added late; a click or a reply is an
// occurrence, delivered once to whoever listens at the time.
var sticky = { colorScheme: true };
// Links must not be lost: one that arrives while nobody listens (the app is still signing in) is
// held and handed to the first handler that is added, once.
var held = { openLink: [] };
var MAX_HELD = 8;
function deliver(name, payload) {
  if (held[name] && !(handlers[name] || []).length) {
    held[name].push(payload);
    if (held[name].length > MAX_HELD) held[name].shift();
    return;
  }
  (handlers[name] || []).slice().forEach(function (handler) {
    try { handler(payload ? JSON.parse(payload) : undefined); } catch (e) { console.error(e); }
  });
}
var ready = new Promise(function (resolve) {
  new QWebChannel(qt.webChannelTransport, function (channel) {
    var bridge = channel.objects.irisDesktop;
    if (bridge) {
      bridge.eventEmitted.connect(function (name, payload) {
        if (sticky[name]) latest[name] = payload;
        deliver(name, payload);
      });
      // Events emitted before this page connected (the colour scheme, on start).
      bridge.latestEvents(function (json) {
        try { Object.assign(latest, JSON.parse(json)); } catch (e) { console.error(e); }
        // Links the shell queued until this page was up (a matrix: URI on the first start).
        bridge.takePendingLinks(function (links) {
          (links || []).forEach(function (payload) { deliver('openLink', payload); });
          resolve(bridge);
        });
      });
    } else {
      resolve(bridge);
    }
  });
});

function call(method, args) {
  return ready.then(function (bridge) {
    if (!bridge) throw new Error('irisDesktop is not available');
    return new Promise(function (resolve) { bridge[method].apply(bridge, (args || []).concat([resolve])); });
  });
}

Object.defineProperty(window, 'irisDesktop', {
  value: Object.freeze({
    version: function () { return call('version'); },
    // Resolves when the shell accepted the counts; rejects if it refused them.
    setUnread: function (counts) {
      return call('setUnread', [counts]).then(function (ok) {
        if (!ok) throw new Error('setUnread: invalid arguments');
      });
    },
    // Shows a KDE notification; rejects if the shell refused the arguments.
    notify: function (notification) {
      return call('notify', [notification]).then(function (ok) {
        if (!ok) throw new Error('notify: invalid arguments');
      });
    },
    closeNotifications: function (target) {
      return call('closeNotifications', [target]).then(function (ok) {
        if (!ok) throw new Error('closeNotifications: invalid arguments');
      });
    },
    on: function (event, handler) {
      (handlers[event] = handlers[event] || []).push(handler);
      if (held[event] && held[event].length) {
        var waiting = held[event]; held[event] = [];
        Promise.resolve().then(function () { waiting.forEach(function (payload) { deliver(event, payload); }); });
      }
      // A late subscriber still learns the current value of a state event.
      ready.then(function () {
        if (latest[event] !== undefined && handlers[event].indexOf(handler) !== -1) {
          try { handler(latest[event] ? JSON.parse(latest[event]) : undefined); } catch (e) { console.error(e); }
        }
      });
      return function () { handlers[event] = (handlers[event] || []).filter(function (h) { return h !== handler; }); };
    },
  }),
  configurable: false,
});
