const WORKER_SOURCE = String.raw`
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const pendingRequests = new Map();
const eventHandlers = new Map();
let hostRequestCounter = 0;

function toMessage(value) {
  if (value instanceof Error) {
    return value.stack || value.message || String(value);
  }
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function createHostError(message) {
  const err = new Error(message || "Unknown host error");
  return err;
}

function callHost(action, payload) {
  return new Promise((resolve, reject) => {
    const requestId = "req-" + (++hostRequestCounter);
    pendingRequests.set(requestId, { resolve, reject });
    postMessage({
      type: "host-request",
      requestId,
      action,
      payload,
    });
  });
}

function addHandler(event, handler) {
  if (typeof handler !== "function") {
    return () => {};
  }
  if (!eventHandlers.has(event)) {
    eventHandlers.set(event, new Set());
  }
  const set = eventHandlers.get(event);
  set.add(handler);
  return () => {
    set.delete(handler);
  };
}

function emitLocalLog(level, values) {
  const message = values.map(toMessage).join(" ");
  postMessage({ type: "host-log", level, message });
}

function createRamApi() {
  const ram = {
    log: (...args) => emitLocalLog("info", args),
    info: (...args) => emitLocalLog("info", args),
    debug: (...args) => emitLocalLog("debug", args),
    warn: (...args) => emitLocalLog("warn", args),
    error: (...args) => emitLocalLog("error", args),
    now: () => Date.now(),
    randomId: () => {
      const rand = Math.random().toString(36).slice(2, 10);
      return "id-" + Date.now() + "-" + rand;
    },
    sleep: (ms) => {
      const safe = Number.isFinite(ms) ? Math.max(0, Number(ms)) : 0;
      return new Promise((resolve) => setTimeout(resolve, safe));
    },
    on: (event, handler) => addHandler(event, handler),
    invoke: (command, args = {}) => callHost("invoke", { command, args }),
    window: {
      snapshot: () => callHost("window.snapshot", {}),
      accounts: () => callHost("window.accounts", {}),
      selected: () => callHost("window.selected", {}),
    },
    http: {
      request: (input) => callHost("http.request", input),
      get: (url, options = {}) => callHost("http.request", { ...options, method: "GET", url }),
      post: (url, body = null, options = {}) =>
        callHost("http.request", { ...options, method: "POST", url, body }),
    },
    ws: {
      connect: (input) => callHost("ws.connect", input),
      send: (connectionId, data) => callHost("ws.send", { connectionId, data }),
      close: (connectionId, options = {}) =>
        callHost("ws.close", { connectionId, ...options }),
      list: () => callHost("ws.list", {}),
      on: (handler) => addHandler("ws", handler),
    },
    modal: {
      alert: (input) => callHost("modal.alert", input),
      confirm: (input) => callHost("modal.confirm", input),
      prompt: (input) => callHost("modal.prompt", input),
      json: (input) => callHost("modal.json", input),
    },
    settings: {
      get: (key, defaultValue = null) => callHost("settings.get", { key, defaultValue }),
      set: (key, value) => callHost("settings.set", { key, value }),
      all: () => callHost("settings.all", {}),
    },
    ui: {
      set: (elements) => callHost("ui.set", { elements }),
      patch: (id, patch) => callHost("ui.patch", { id, patch }),
      clear: () => callHost("ui.clear", {}),
      on: (handler) => addHandler("ui", handler),
    },
  };
  return ram;
}

async function runUserScript(code, metadata) {
  const ram = createRamApi();
  const wrapped = new AsyncFunction(
    "ram",
    "script",
    "metadata",
    "\"use strict\";\\nconst window = void 0;\\nconst globalThis = void 0;\\n" + code
  );
  await wrapped(ram, ram, metadata);
}

self.addEventListener("unhandledrejection", (event) => {
  postMessage({
    type: "script-error",
    error: toMessage(event.reason),
  });
});

self.onmessage = async (event) => {
  const message = event.data || {};

  if (message.type === "host-response") {
    const pending = pendingRequests.get(message.requestId);
    if (!pending) return;
    pendingRequests.delete(message.requestId);
    if (message.ok) {
      pending.resolve(message.result);
    } else {
      pending.reject(createHostError(message.error));
    }
    return;
  }

  if (message.type === "host-event") {
    const handlers = eventHandlers.get(message.event);
    if (!handlers || handlers.size === 0) return;
    for (const handler of handlers) {
      try {
        Promise.resolve(handler(message.payload)).catch((err) => {
          emitLocalLog("error", [err]);
        });
      } catch (err) {
        emitLocalLog("error", [err]);
      }
    }
    return;
  }

  if (message.type === "start") {
    try {
      await runUserScript(message.code || "", message.metadata || {});
      postMessage({ type: "script-finished" });
    } catch (err) {
      postMessage({ type: "script-error", error: toMessage(err) });
    }
    return;
  }

  if (message.type === "stop") {
    close();
  }
};
`;

export function createScriptWorker(): Worker {
  const blob = new Blob([WORKER_SOURCE], { type: "text/javascript" });
  const workerUrl = URL.createObjectURL(blob);
  const worker = new Worker(workerUrl, { name: "ram-script-worker" });
  URL.revokeObjectURL(workerUrl);
  return worker;
}
