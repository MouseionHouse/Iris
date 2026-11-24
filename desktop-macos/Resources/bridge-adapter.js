// Builds window.irisDesktop on top of the WebKit message handler of the same name (macOS shell).
// The same object as the Linux shell's desktop/src/bridge-adapter.js, with the same contract
// (desktop/BRIDGE.md): methods return promises; on(event, handler) returns a function that removes
// the handler. The shell wraps this in a check of location.origin and checks every message's frame
// itself, so a page on another origin gets nothing.
var handler = window.webkit.messageHandlers.irisDesktop;
// Bound now: the page cannot swap it out from under the adapter later.
var post = handler.postMessage.bind(handler);
function invoke(method, args) {
  // Arguments go as JSON text, so the shell sees JSON's types and nothing else.
  return post({ method: method, args: JSON.stringify(args || []) });
}

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
  (handlers[name] || []).slice().forEach(function (h) {
    try {
      h(payload ? JSON.parse(payload) : undefined);
    } catch (e) {
      console.error(e);
    }
  });
}

// Native -> web: the shell calls this with an event's name and its payload as JSON text.
Object.defineProperty(window, '__irisDesktopEvent', {
  value: function (name, payload) {
    if (typeof name !== 'string' || typeof payload !== 'string') return;
    if (sticky[name]) latest[name] = payload;
    deliver(name, payload);
  },
  configurable: false,
  enumerable: false,
  writable: false,
});

var ready = invoke('latestEvents')
  .then(function (json) {
    // Events emitted before this page was up (the colour scheme, on start).
    try {
      var past = JSON.parse(json);
      Object.keys(past).forEach(function (name) {
        if (latest[name] === undefined) latest[name] = past[name];
      });
    } catch (e) {
      console.error(e);
    }
    // Links the shell queued until this page was up (a matrix: link on the first start).
    return invoke('takePendingLinks');
  })
  .then(function (links) {
    (links || []).forEach(function (payload) {
      deliver('openLink', payload);
    });
  })
  .catch(function (e) {
    console.error(e);
  });

function call(method, args) {
  return ready.then(function () {
    return invoke(method, args);
  });
}

function checked(method) {
  return function (arg) {
    return call(method, [arg]).then(function (ok) {
      if (!ok) throw new Error(method + ': invalid arguments');
    });
  };
}

Object.defineProperty(window, 'irisDesktop', {
  value: Object.freeze({
    version: function () {
      return call('version');
    },
    // Resolves when the shell accepted the counts; rejects if it refused them.
    setUnread: checked('setUnread'),
    // Shows a macOS notification; rejects if the shell refused the arguments.
    notify: checked('notify'),
    closeNotifications: checked('closeNotifications'),
    on: function (event, h) {
      (handlers[event] = handlers[event] || []).push(h);
      if (held[event] && held[event].length) {
        var waiting = held[event];
        held[event] = [];
        Promise.resolve().then(function () {
          waiting.forEach(function (payload) {
            deliver(event, payload);
          });
        });
      }
      // A late subscriber still learns the current value of a state event.
      ready.then(function () {
        if (latest[event] !== undefined && handlers[event].indexOf(h) !== -1) {
          try {
            h(latest[event] ? JSON.parse(latest[event]) : undefined);
          } catch (e) {
            console.error(e);
          }
        }
      });
      return function () {
        handlers[event] = (handlers[event] || []).filter(function (x) {
          return x !== h;
        });
      };
    },
  }),
  configurable: false,
});
