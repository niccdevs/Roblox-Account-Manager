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
    .replace(/[\u201c\u201d\u201e\u201f]/g, "\"")
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
    return " [suspicious U+" + code.toString(16).padStart(4, "0") + " at line " + line + ", col " + col + "] " + before + "<?>" + after;
  }
  return "";
}

function createEvalRunner(prelude, source) {
  const serialized = JSON.stringify(source)
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

  const runnerBody =
    prelude +
    "const __code = " +
    serialized +
    ";\n" +
    "const __runner = '(async function(){' + String.fromCharCode(10) + __code + String.fromCharCode(10) + '})()';\n" +
    "return eval(__runner);";

  return new AsyncFunction(
    "ram",
    "script",
    "metadata",
    runnerBody
  );
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
  const ram = createRamApi();
  const normalizedCode = normalizeUserCode(code);
  const prelude = [
    '"use strict";',
    'const window = void 0;',
    'const globalThis = void 0;',
    "",
  ].join("\n");
  let wrapped = null;
  try {
    wrapped = new AsyncFunction(
      "ram",
      "script",
      "metadata",
      prelude + normalizedCode
    );
  } catch (error) {
    const fallbackCode = stripToAsciiForCompile(normalizedCode);
    if (fallbackCode !== normalizedCode) {
      try {
        wrapped = new AsyncFunction(
          "ram",
          "script",
          "metadata",
          prelude + fallbackCode
        );
        emitLocalLog("warn", [
          "Script contained non-ASCII characters; runtime sanitized them for compilation. Save script to remove hidden characters.",
        ]);
      } catch (fallbackError) {
        try {
          wrapped = createEvalRunner(prelude, fallbackCode);
          emitLocalLog("warn", [
            "Script required fallback runtime parser. Please re-save script to normalize source.",
          ]);
        } catch (evalError) {
          const context = extractSyntaxContext(fallbackError, fallbackCode, 3);
          const suspicious = describeSuspiciousChar(normalizedCode);
          throw new Error(
            "Script compile failed: " +
              toMessage(evalError) +
              " (check for invalid quotes/backticks or hidden characters)" +
              context +
              suspicious
          );
        }
      }
    } else {
      try {
        wrapped = createEvalRunner(prelude, normalizedCode);
        emitLocalLog("warn", [
          "Script required fallback runtime parser. Please re-save script to normalize source.",
        ]);
      } catch (evalError) {
        const context = extractSyntaxContext(error, normalizedCode, 3);
        const suspicious = describeSuspiciousChar(normalizedCode);
        throw new Error(
          "Script compile failed: " +
            toMessage(evalError) +
            " (check for invalid quotes/backticks or hidden characters)" +
            context +
            suspicious
        );
      }
    }
  }
  try {
    await wrapped(ram, ram, metadata);
  } catch (error) {
    throw new Error("Script runtime failed: " + toMessage(error));
  }
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
