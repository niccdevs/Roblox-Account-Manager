const WORKER_SOURCE = String.raw`
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const GeneratorFunction = Object.getPrototypeOf(function* () {}).constructor;
const AsyncGeneratorFunction = Object.getPrototypeOf(async function* () {}).constructor;
const pendingRequests = new Map();
const eventHandlers = new Map();
let hostRequestCounter = 0;
let intrinsicsHardened = false;
const HOST_REQUEST_TIMEOUT_MS = 20000;
const MAX_LOG_MESSAGE_LENGTH = 4000;

const safePostMessage = postMessage.bind(self);
const nativeSetTimeout = setTimeout.bind(self);
const nativeClearTimeout = clearTimeout.bind(self);
const nativeSetInterval = setInterval.bind(self);
const nativeClearInterval = clearInterval.bind(self);
const nativeQueueMicrotask =
  typeof queueMicrotask === "function" ? queueMicrotask.bind(self) : null;

const SANDBOX_ALLOWED_GLOBALS = [
  "Array",
  "ArrayBuffer",
  "Atomics",
  "BigInt",
  "BigInt64Array",
  "BigUint64Array",
  "Boolean",
  "DataView",
  "Date",
  "decodeURI",
  "decodeURIComponent",
  "encodeURI",
  "encodeURIComponent",
  "Error",
  "EvalError",
  "Float32Array",
  "Float64Array",
  "Int8Array",
  "Int16Array",
  "Int32Array",
  "Intl",
  "isFinite",
  "isNaN",
  "JSON",
  "Map",
  "Math",
  "Number",
  "Object",
  "parseFloat",
  "parseInt",
  "Promise",
  "Proxy",
  "RangeError",
  "ReferenceError",
  "Reflect",
  "RegExp",
  "Set",
  "String",
  "Symbol",
  "SyntaxError",
  "TextDecoder",
  "TextEncoder",
  "TypeError",
  "URIError",
  "URL",
  "URLSearchParams",
  "Uint8Array",
  "Uint8ClampedArray",
  "Uint16Array",
  "Uint32Array",
  "WeakMap",
  "WeakSet",
  "atob",
  "btoa",
  "crypto",
  "structuredClone",
];

const SANDBOX_BLOCKED_NAMES = new Set([
  "globalThis",
  "self",
  "window",
  "document",
  "navigator",
  "location",
  "origin",
  "postMessage",
  "close",
  "onmessage",
  "onerror",
  "onunhandledrejection",
  "fetch",
  "WebSocket",
  "XMLHttpRequest",
  "Worker",
  "SharedWorker",
  "BroadcastChannel",
  "EventSource",
  "importScripts",
  "indexedDB",
  "caches",
  "localStorage",
  "sessionStorage",
  "Function",
  "AsyncFunction",
  "GeneratorFunction",
  "AsyncGeneratorFunction",
  "eval",
]);

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
    const requestId = "req-" + ++hostRequestCounter;
    const timeout = nativeSetTimeout(() => {
      if (!pendingRequests.has(requestId)) {
        return;
      }
      pendingRequests.delete(requestId);
      reject(createHostError("Host request timed out: " + action));
    }, HOST_REQUEST_TIMEOUT_MS);

    pendingRequests.set(requestId, {
      resolve: (value) => {
        nativeClearTimeout(timeout);
        resolve(value);
      },
      reject: (error) => {
        nativeClearTimeout(timeout);
        reject(error);
      },
    });

    safePostMessage({
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
  const joined = values.map(toMessage).join(" ");
  const message =
    joined.length > MAX_LOG_MESSAGE_LENGTH
      ? joined.slice(0, MAX_LOG_MESSAGE_LENGTH) + "... [truncated]"
      : joined;
  safePostMessage({ type: "host-log", level, message });
}

function hardenPrototype(proto) {
  if (!proto || (typeof proto !== "object" && typeof proto !== "function")) {
    return;
  }

  try {
    if (Object.prototype.hasOwnProperty.call(proto, "constructor")) {
      try {
        proto.constructor = undefined;
      } catch {
      }
      try {
        Object.defineProperty(proto, "constructor", {
          value: undefined,
          configurable: false,
          enumerable: false,
          writable: false,
        });
      } catch {
      }
    }
  } catch {
  }

  try {
    Object.freeze(proto);
  } catch {
  }
}

function hardenConstructor(ctor) {
  if (typeof ctor !== "function") {
    return;
  }
  hardenPrototype(ctor.prototype);
  try {
    Object.freeze(ctor);
  } catch {
  }
}

function hardenIntrinsics() {
  if (intrinsicsHardened) {
    return;
  }
  intrinsicsHardened = true;

  const constructorNames = [
    "Object",
    "Array",
    "String",
    "Number",
    "Boolean",
    "Date",
    "RegExp",
    "Error",
    "EvalError",
    "RangeError",
    "ReferenceError",
    "SyntaxError",
    "TypeError",
    "URIError",
    "Map",
    "Set",
    "WeakMap",
    "WeakSet",
    "Promise",
    "Proxy",
    "ArrayBuffer",
    "DataView",
    "Int8Array",
    "Int16Array",
    "Int32Array",
    "Uint8Array",
    "Uint8ClampedArray",
    "Uint16Array",
    "Uint32Array",
    "Float32Array",
    "Float64Array",
    "BigInt64Array",
    "BigUint64Array",
    "TextEncoder",
    "TextDecoder",
    "URL",
    "URLSearchParams",
    "Function",
  ];

  for (const name of constructorNames) {
    let value;
    try {
      value = self[name];
    } catch {
      value = undefined;
    }
    hardenConstructor(value);
  }

  hardenConstructor(AsyncFunction);
  hardenConstructor(GeneratorFunction);
  hardenConstructor(AsyncGeneratorFunction);
  hardenPrototype(Function && Function.prototype);
  hardenPrototype(AsyncFunction && AsyncFunction.prototype);
  hardenPrototype(GeneratorFunction && GeneratorFunction.prototype);
  hardenPrototype(AsyncGeneratorFunction && AsyncGeneratorFunction.prototype);
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || (typeof value !== "object" && typeof value !== "function")) {
    return value;
  }
  if (seen.has(value)) {
    return value;
  }

  seen.add(value);

  const keys = [
    ...Object.getOwnPropertyNames(value),
    ...Object.getOwnPropertySymbols(value),
  ];

  for (const key of keys) {
    try {
      deepFreeze(value[key], seen);
    } catch {
    }
  }

  try {
    Object.freeze(value);
  } catch {
  }
  return value;
}

function createSafeTimerApi() {
  const safeTimers = {
    setTimeout: (handler, ms = 0, ...args) => {
      if (typeof handler !== "function") {
        throw new Error("setTimeout requires a function callback");
      }
      const safeMs = Number.isFinite(ms) ? Math.max(0, Number(ms)) : 0;
      return nativeSetTimeout(handler, safeMs, ...args);
    },
    clearTimeout: (id) => nativeClearTimeout(id),
    setInterval: (handler, ms = 0, ...args) => {
      if (typeof handler !== "function") {
        throw new Error("setInterval requires a function callback");
      }
      const safeMs = Number.isFinite(ms) ? Math.max(0, Number(ms)) : 0;
      return nativeSetInterval(handler, safeMs, ...args);
    },
    clearInterval: (id) => nativeClearInterval(id),
  };
  return deepFreeze(safeTimers);
}

function createSafeConsole() {
  return deepFreeze({
    log: (...args) => emitLocalLog("info", args),
    info: (...args) => emitLocalLog("info", args),
    debug: (...args) => emitLocalLog("debug", args),
    warn: (...args) => emitLocalLog("warn", args),
    error: (...args) => emitLocalLog("error", args),
  });
}

function createExecutionGlobals(ram, metadata) {
  const globals = Object.create(null);
  const safeTimers = createSafeTimerApi();

  globals.ram = ram;
  globals.script = ram;
  globals.metadata = deepFreeze(
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? { ...metadata }
      : {}
  );
  globals.console = createSafeConsole();
  globals.setTimeout = safeTimers.setTimeout;
  globals.clearTimeout = safeTimers.clearTimeout;
  globals.setInterval = safeTimers.setInterval;
  globals.clearInterval = safeTimers.clearInterval;
  if (nativeQueueMicrotask) {
    globals.queueMicrotask = nativeQueueMicrotask;
  }

  for (const name of SANDBOX_ALLOWED_GLOBALS) {
    if (Object.prototype.hasOwnProperty.call(globals, name)) {
      continue;
    }
    let value;
    try {
      value = self[name];
    } catch {
      value = undefined;
    }
    if (value !== undefined) {
      globals[name] = value;
    }
  }

  globals.undefined = undefined;
  globals.NaN = NaN;
  globals.Infinity = Infinity;

  for (const name of SANDBOX_BLOCKED_NAMES) {
    globals[name] = undefined;
  }

  return deepFreeze(globals);
}

function createSandboxProxy(globals) {
  return new Proxy(globals, {
    has() {
      return true;
    },
    get(target, key) {
      if (key === Symbol.unscopables) {
        return undefined;
      }
      if (Object.prototype.hasOwnProperty.call(target, key)) {
        return target[key];
      }
      return undefined;
    },
    set() {
      return false;
    },
    defineProperty() {
      return false;
    },
    deleteProperty() {
      return false;
    },
    getPrototypeOf() {
      return null;
    },
  });
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
      return new Promise((resolve) => nativeSetTimeout(resolve, safe));
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
      get: (url, options = {}) =>
        callHost("http.request", { ...options, method: "GET", url }),
      post: (url, body = null, options = {}) =>
        callHost("http.request", { ...options, method: "POST", url, body }),
    },
    ws: {
      connect: (input) => callHost("ws.connect", input),
      send: (connectionId, data) =>
        callHost("ws.send", { connectionId, data }),
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
      get: (key, defaultValue = null) =>
        callHost("settings.get", { key, defaultValue }),
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

function normalizeUserCode(code) {
  let text = typeof code === "string" ? code : String(code || "");
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  if (typeof text.normalize === "function") {
    try {
      text = text.normalize("NFKC");
    } catch {
    }
  }

  text = text.replace(/[\uff01-\uff5e]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
  );

  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, "")
    .replace(/[\u200b-\u200f\u2060\ufeff]/g, "")
    .replace(/[\u202a-\u202e]/g, "")
    .replace(/[\ud800-\udfff]/g, "")
    .replace(/\u2028|\u2029/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[\u2018\u2019\u201a\u201b]/g, "'")
    .replace(/[\u201c\u201d\u201e\u201f]/g, '"')
    .replace(/[\u00b4\u02cb\u2032\u2035\uff40]/g, "\u0060")
    .replace(/[\u2013\u2014\u2212]/g, "-");
}

function stripToAsciiForCompile(source) {
  let out = "";
  for (let i = 0; i < source.length; i += 1) {
    const code = source.charCodeAt(i);
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 126)) {
      out += source[i];
    } else {
      out += " ";
    }
  }
  return out;
}

function describeSuspiciousChar(source) {
  for (let i = 0; i < source.length; i += 1) {
    const code = source.charCodeAt(i);
    const isPrintableAscii = code >= 32 && code <= 126;
    const isWhitespace = code === 9 || code === 10 || code === 13;
    if (isPrintableAscii || isWhitespace) continue;

    const before = source.slice(Math.max(0, i - 12), i);
    const after = source.slice(i + 1, Math.min(source.length, i + 13));
    const line = source.slice(0, i).split("\n").length;
    const col = i - source.lastIndexOf("\n", i - 1);
    return (
      " [suspicious U+" +
      code.toString(16).padStart(4, "0") +
      " at line " +
      line +
      ", col " +
      col +
      "] " +
      before +
      "<?>" +
      after
    );
  }
  return "";
}

function assertNoDynamicImport(source) {
  const importCallPattern =
    /\bimport(?:\s|\/\*[\s\S]*?\*\/|\/\/[^\n]*(?:\n|$))*\(/;
  const importScriptsPattern =
    /\bimportScripts(?:\s|\/\*[\s\S]*?\*\/|\/\/[^\n]*(?:\n|$))*\(/;

  if (importCallPattern.test(source)) {
    throw new Error(
      "Dynamic import() is blocked in scripts. Use ram.http.* or ram.ws.* for external integrations."
    );
  }
  if (importScriptsPattern.test(source)) {
    throw new Error("importScripts() is blocked in scripts.");
  }
}

function createSandboxRunner(source) {
  const body = [
    "with (__scope) {",
    "return (async () => {",
    '"use strict";',
    source,
    "})();",
    "}",
  ].join("\n");
  return new AsyncFunction("__scope", body);
}

function extractSyntaxContext(error, source, preludeLines) {
  const text = toMessage(error);
  const match = text.match(/<anonymous>:(\d+):(\d+)/);
  if (!match) return "";

  const rawLine = Number(match[1]);
  const rawColumn = Number(match[2]);
  if (!Number.isFinite(rawLine) || !Number.isFinite(rawColumn)) return "";

  const scriptLine = rawLine - preludeLines;
  if (scriptLine < 1) return " [line " + scriptLine + ", col " + rawColumn + "]";

  const lines = source.split("\n");
  const content = lines[scriptLine - 1] || "";
  const snippet = content.length > 180 ? content.slice(0, 180) + "..." : content;
  return " [line " + scriptLine + ", col " + rawColumn + "] " + snippet;
}

async function runUserScript(code, metadata) {
  hardenIntrinsics();

  const ram = deepFreeze(createRamApi());
  const normalizedCode = normalizeUserCode(code);

  try {
    assertNoDynamicImport(normalizedCode);
  } catch (error) {
    throw new Error("Script compile failed: " + toMessage(error));
  }

  let wrapped = null;
  let compileSource = normalizedCode;

  try {
    wrapped = createSandboxRunner(compileSource);
  } catch (error) {
    const fallbackCode = stripToAsciiForCompile(normalizedCode);
    if (fallbackCode !== normalizedCode) {
      try {
        assertNoDynamicImport(fallbackCode);
        wrapped = createSandboxRunner(fallbackCode);
        compileSource = fallbackCode;
        emitLocalLog("warn", [
          "Script contained non-ASCII characters; runtime sanitized them for compilation. Save script to remove hidden characters.",
        ]);
      } catch (fallbackError) {
        const context = extractSyntaxContext(fallbackError, fallbackCode, 3);
        const suspicious = describeSuspiciousChar(normalizedCode);
        throw new Error(
          "Script compile failed: " +
            toMessage(fallbackError) +
            " (check for invalid quotes/backticks or hidden characters)" +
            context +
            suspicious
        );
      }
    } else {
      const context = extractSyntaxContext(error, normalizedCode, 3);
      const suspicious = describeSuspiciousChar(normalizedCode);
      throw new Error(
        "Script compile failed: " +
          toMessage(error) +
          " (check for invalid quotes/backticks or hidden characters)" +
          context +
          suspicious
      );
    }
  }

  const globals = createExecutionGlobals(ram, metadata);
  const sandbox = createSandboxProxy(globals);

  try {
    await wrapped(sandbox);
  } catch (error) {
    throw new Error("Script runtime failed: " + toMessage(error));
  }
}

self.addEventListener("unhandledrejection", (event) => {
  safePostMessage({
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
      safePostMessage({ type: "script-finished" });
    } catch (err) {
      safePostMessage({ type: "script-error", error: toMessage(err) });
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
