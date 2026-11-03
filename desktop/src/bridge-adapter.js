// Builds window.irisDesktop on top of the QWebChannel object of the same name.
// Methods return promises; on(event, handler) returns a function that removes the handler.
var handlers = {};
var latest = {};
function deliver(name, payload) {
  (handlers[name] || []).slice().forEach(function (handler) {
    try { handler(payload ? JSON.parse(payload) : undefined); } catch (e) { console.error(e); }
  });
}
var ready = new Promise(function (resolve) {
  new QWebChannel(qt.webChannelTransport, function (channel) {
    var bridge = channel.objects.irisDesktop;
    if (bridge) {
      bridge.eventEmitted.connect(function (name, payload) {
        latest[name] = payload;
        deliver(name, payload);
      });
      // Events emitted before this page connected (the colour scheme, on start).
      bridge.latestEvents(function (json) {
        try { Object.assign(latest, JSON.parse(json)); } catch (e) { console.error(e); }
        resolve(bridge);
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
    on: function (event, handler) {
      (handlers[event] = handlers[event] || []).push(handler);
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
