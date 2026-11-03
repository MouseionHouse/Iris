// Builds window.irisDesktop on top of the QWebChannel object of the same name.
// Methods return promises; on(event, handler) returns a function that removes the handler.
var handlers = {};
var ready = new Promise(function (resolve) {
  new QWebChannel(qt.webChannelTransport, function (channel) {
    var bridge = channel.objects.irisDesktop;
    if (bridge) {
      bridge.eventEmitted.connect(function (name, payload) {
        (handlers[name] || []).slice().forEach(function (handler) {
          try { handler(payload ? JSON.parse(payload) : undefined); } catch (e) { console.error(e); }
        });
      });
    }
    resolve(bridge);
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
    on: function (event, handler) {
      (handlers[event] = handlers[event] || []).push(handler);
      return function () { handlers[event] = (handlers[event] || []).filter(function (h) { return h !== handler; }); };
    },
  }),
  configurable: false,
});
