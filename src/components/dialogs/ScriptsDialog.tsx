import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  Play,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Square,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useStore } from "../../store";
import { useModalClose } from "../../hooks/useModalClose";
import { useConfirm, usePrompt } from "../../hooks/usePrompt";
import { useTr } from "../../i18n/text";
import { createScriptWorker } from "../../scripting/workerSource";
import { Select } from "../ui/Select";
import { MenuItemView } from "../menus/MenuItemView";
import type { MenuItem } from "../menus/MenuItemView";
import type {
  ManagedScript,
  ScriptLogEntry,
  ScriptLogLevel,
  ScriptPermissions,
  ScriptRuntimeState,
  ScriptUiElement,
  ScriptWindowSnapshot,
  WorkerIncomingMessage,
} from "../../scripting/types";

type ScriptTabId = "editor" | "ui" | "logs" | "api";

interface ScriptsDialogProps {
  open: boolean;
  onClose: () => void;
}

interface SavePickerWritable {
  write: (data: string) => Promise<void>;
  close: () => Promise<void>;
}

interface SavePickerHandle {
  createWritable: () => Promise<SavePickerWritable>;
}

interface SavePickerApi {
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: Array<{
      description?: string;
      accept: Record<string, string[]>;
    }>;
  }) => Promise<SavePickerHandle>;
}

interface WorkerRuntime {
  worker: Worker;
  pending: Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
    }
  >;
  sockets: Map<string, WebSocket>;
}

interface ScriptContextMenuState {
  scriptId: string;
  x: number;
  y: number;
}

const DEFAULT_SCRIPT_SOURCE = `
ram.info("Script loaded");

ram.on("window:update", (snapshot) => {
  const online = Object.values(snapshot.presenceByUserId || {}).filter((state) => state >= 1).length;
  ram.ui.set([
    { id: "status", type: "badge", text: "Online: " + online, tone: online > 0 ? "success" : "warn" },
    { id: "refresh", type: "button", label: "Refresh Snapshot", text: "Refresh Snapshot" },
    { id: "note", type: "textarea", label: "Notes", placeholder: "Write script notes...", rows: 4 },
  ]);
});

ram.ui.on(async (event) => {
  if (event.id === "refresh" && event.action === "click") {
    const snapshot = await ram.window.snapshot();
    ram.info("Selected users:", snapshot.selectedUserIds);
  }
});

const snapshot = await ram.window.snapshot();
ram.info("Loaded", snapshot.accounts.length, "accounts");
`;

const DISCORD_BRIDGE_TEMPLATE = `
const endpoint = await ram.settings.get("endpoint", "http://127.0.0.1:3847/ram/bridge");
const wsEndpoint = await ram.settings.get("wsEndpoint", "");
const authToken = await ram.settings.get("token", "");
const intervalMs = Number(await ram.settings.get("intervalMs", 5000));
let wsConnectionId = "";

ram.info("Discord bridge started", endpoint);

if (wsEndpoint) {
  try {
    const ws = await ram.ws.connect({ url: wsEndpoint });
    wsConnectionId = ws.connectionId;
    ram.info("Connected to websocket bridge", wsConnectionId);
  } catch (error) {
    ram.warn("WebSocket bridge unavailable, falling back to HTTP polling", error);
  }
}

ram.ws.on(async (event) => {
  if (!wsConnectionId || event.connectionId !== wsConnectionId) return;
  if (event.event !== "message") return;

  const payload = event.json;
  if (!payload || !Array.isArray(payload.actions)) return;

  for (const action of payload.actions) {
    if (action.type === "launch" && typeof action.userId === "number") {
      await ram.invoke("launch_roblox", {
        userId: action.userId,
        placeId: Number(action.placeId || 0),
        jobId: String(action.jobId || ""),
        launchData: String(action.launchData || ""),
        followUser: false,
        joinVip: false,
        linkCode: "",
        shuffleJob: false,
      });
    }

    if (action.type === "close" && typeof action.userId === "number") {
      await ram.invoke("cmd_kill_roblox", { userId: action.userId });
    }
  }
});

async function postStatus() {
  const snapshot = await ram.window.snapshot();
  const payload = {
    sentAt: Date.now(),
    accounts: snapshot.accounts,
    selectedUserIds: snapshot.selectedUserIds,
    presenceByUserId: snapshot.presenceByUserId,
    launchedUserIds: snapshot.launchedUserIds,
  };

  const response = await ram.http.request({
    url: endpoint + "/status",
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authToken ? { authorization: "Bearer " + authToken } : {}),
    },
    body: payload,
    timeoutMs: 8000,
  });

  if (!response.ok) {
    ram.warn("Status push failed", response.status, response.text);
    return;
  }

  if (response.json && Array.isArray(response.json.actions)) {
    for (const action of response.json.actions) {
      if (action.type === "launch" && typeof action.userId === "number") {
        await ram.invoke("launch_roblox", {
          userId: action.userId,
          placeId: Number(action.placeId || 0),
          jobId: String(action.jobId || ""),
          launchData: String(action.launchData || ""),
          followUser: false,
          joinVip: false,
          linkCode: "",
          shuffleJob: false,
        });
      }

      if (action.type === "close" && typeof action.userId === "number") {
        await ram.invoke("cmd_kill_roblox", { userId: action.userId });
      }
    }
  }

  if (wsConnectionId) {
    await ram.ws.send(wsConnectionId, {
      type: "status",
      payload,
    });
  }
}

while (true) {
  try {
    await postStatus();
  } catch (error) {
    ram.error("Bridge error", error);
  }
  await ram.sleep(intervalMs);
}
`;

function nowMs(): number {
  return Date.now();
}

function buildId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now()}-${rand}`;
}

function defaultPermissions(): ScriptPermissions {
  return {
    allowInvoke: true,
    allowHttp: true,
    allowWebSocket: true,
    allowWindow: true,
    allowModal: true,
    allowSettings: true,
    allowUi: true,
  };
}

function normalizeScript(input: ManagedScript): ManagedScript {
  return {
    id: String(input.id || ""),
    name: String(input.name || "Unnamed Script"),
    description: String(input.description || ""),
    language: String(input.language || "javascript"),
    source: String(input.source || ""),
    enabled: Boolean(input.enabled),
    trusted: Boolean(input.trusted),
    autoStart: Boolean(input.autoStart),
    permissions: {
      ...defaultPermissions(),
      ...(input.permissions || {}),
    },
    createdAtMs: Number(input.createdAtMs || nowMs()),
    updatedAtMs: Number(input.updatedAtMs || nowMs()),
  };
}

function createScript(name: string, description: string, source: string): ManagedScript {
  const ts = nowMs();
  return {
    id: buildId("script"),
    name,
    description,
    language: "javascript",
    source,
    enabled: true,
    trusted: false,
    autoStart: false,
    permissions: defaultPermissions(),
    createdAtMs: ts,
    updatedAtMs: ts,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function safeMessage(value: unknown): string {
  if (value instanceof Error) {
    return value.stack || value.message || String(value);
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function sanitizeScriptSourceForSave(input: string): string {
  let text = typeof input === "string" ? input : String(input || "");
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  if (typeof text.normalize === "function") {
    try {
      text = text.normalize("NFKC");
    } catch {
    }
  }

  text = text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, "")
    .replace(/[\u200b-\u200f\u2060\ufeff]/g, "")
    .replace(/[\u202a-\u202e]/g, "")
    .replace(/[\ud800-\udfff]/g, "")
    .replace(/[\u2018\u2019\u201a\u201b]/g, "'")
    .replace(/[\u201c\u201d\u201e\u201f]/g, "\"")
    .replace(/[\u00b4\u02cb\u2032\u2035\uff40]/g, "\u0060")
    .replace(/[\u2013\u2014\u2212]/g, "-");

  const fence = text.match(/^\s*```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)\n\s*```\s*$/);
  if (fence && fence[1]) {
    text = fence[1];
  }

  return text;
}

function normalizeWebSocketUrl(input: string): string {
  const value = input.trim();
  if (!value) {
    throw new Error("WebSocket URL is required");
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Invalid WebSocket URL");
  }
  if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
    throw new Error("WebSocket URL must start with ws:// or wss://");
  }
  return parsed.toString();
}

function wsStateLabel(state: number): string {
  if (state === WebSocket.CONNECTING) return "CONNECTING";
  if (state === WebSocket.OPEN) return "OPEN";
  if (state === WebSocket.CLOSING) return "CLOSING";
  if (state === WebSocket.CLOSED) return "CLOSED";
  return String(state);
}

async function wsMessageToPayload(data: unknown): Promise<{ text: string | null; json: unknown | null }> {
  if (typeof data === "string") {
    if (data.trim().length === 0) {
      return { text: data, json: null };
    }
    try {
      return { text: data, json: JSON.parse(data) };
    } catch {
      return { text: data, json: null };
    }
  }

  if (data instanceof Blob) {
    const text = await data.text();
    if (text.trim().length === 0) {
      return { text, json: null };
    }
    try {
      return { text, json: JSON.parse(text) };
    } catch {
      return { text, json: null };
    }
  }

  if (data instanceof ArrayBuffer) {
    const text = new TextDecoder().decode(new Uint8Array(data));
    if (text.trim().length === 0) {
      return { text, json: null };
    }
    try {
      return { text, json: JSON.parse(text) };
    } catch {
      return { text, json: null };
    }
  }

  return {
    text: null,
    json: null,
  };
}

function normalizeUiElements(input: unknown): ScriptUiElement[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const elements: ScriptUiElement[] = [];

  for (const entry of input) {
    const row = asRecord(entry);
    const id = String(row.id || "").trim();
    const type = String(row.type || "").trim().toLowerCase();
    if (!id || !type) {
      continue;
    }

    const normalized: ScriptUiElement = {
      id,
      type:
        type === "button" ||
        type === "text" ||
        type === "number" ||
        type === "toggle" ||
        type === "select" ||
        type === "textarea" ||
        type === "badge" ||
        type === "divider"
          ? type
          : "text",
      label: typeof row.label === "string" ? row.label : undefined,
      text: typeof row.text === "string" ? row.text : undefined,
      value:
        typeof row.value === "string" ||
        typeof row.value === "number" ||
        typeof row.value === "boolean"
          ? row.value
          : undefined,
      placeholder:
        typeof row.placeholder === "string" ? row.placeholder : undefined,
      min: typeof row.min === "number" ? row.min : undefined,
      max: typeof row.max === "number" ? row.max : undefined,
      step: typeof row.step === "number" ? row.step : undefined,
      rows: typeof row.rows === "number" ? row.rows : undefined,
      width: typeof row.width === "number" ? row.width : undefined,
      disabled: Boolean(row.disabled),
      tone:
        row.tone === "success" ||
        row.tone === "warn" ||
        row.tone === "error" ||
        row.tone === "accent"
          ? row.tone
          : "default",
      options: Array.isArray(row.options)
        ? row.options
            .map((option) => {
              const valueRow = asRecord(option);
              const label = String(valueRow.label || valueRow.value || "").trim();
              const value = String(valueRow.value || valueRow.label || "").trim();
              if (!label || !value) {
                return null;
              }
              return { label, value };
            })
            .filter((option): option is { label: string; value: string } => option !== null)
        : undefined,
    };

    elements.push(normalized);
  }

  return elements;
}

function applyUiPatch(elements: ScriptUiElement[], id: string, patch: unknown): ScriptUiElement[] {
  const delta = asRecord(patch);
  return elements.map((item) => {
    if (item.id !== id) {
      return item;
    }
    const next = { ...item };
    if (typeof delta.label === "string") next.label = delta.label;
    if (typeof delta.text === "string") next.text = delta.text;
    if (typeof delta.value === "string" || typeof delta.value === "number" || typeof delta.value === "boolean") {
      next.value = delta.value;
    }
    if (typeof delta.placeholder === "string") next.placeholder = delta.placeholder;
    if (typeof delta.min === "number") next.min = delta.min;
    if (typeof delta.max === "number") next.max = delta.max;
    if (typeof delta.step === "number") next.step = delta.step;
    if (typeof delta.rows === "number") next.rows = delta.rows;
    if (typeof delta.width === "number") next.width = delta.width;
    if (typeof delta.disabled === "boolean") next.disabled = delta.disabled;
    if (
      delta.tone === "default" ||
      delta.tone === "success" ||
      delta.tone === "warn" ||
      delta.tone === "error" ||
      delta.tone === "accent"
    ) {
      next.tone = delta.tone;
    }
    if (Array.isArray(delta.options)) {
      next.options = normalizeUiElements([{ id: "x", type: "select", options: delta.options }])[0]?.options;
    }
    return next;
  });
}

function createInitialRuntime(): ScriptRuntimeState {
  return {
    status: "idle",
    startedAtMs: null,
    stoppedAtMs: null,
    lastError: null,
    uiElements: [],
  };
}

function getScriptSecuritySignature(script: ManagedScript): string {
  const p = script.permissions;
  return [
    script.trusted ? "1" : "0",
    p.allowInvoke ? "1" : "0",
    p.allowHttp ? "1" : "0",
    p.allowWebSocket ? "1" : "0",
    p.allowWindow ? "1" : "0",
    p.allowModal ? "1" : "0",
    p.allowSettings ? "1" : "0",
    p.allowUi ? "1" : "0",
  ].join("");
}

export function ScriptsDialog({ open, onClose }: ScriptsDialogProps) {
  const store = useStore();
  const t = useTr();
  const prompt = usePrompt();
  const confirm = useConfirm();
  const { visible, closing, handleClose } = useModalClose(open, onClose);

  const [scripts, setScripts] = useState<ManagedScript[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<ScriptTabId>("editor");
  const [query, setQuery] = useState("");
  const [runningOnly, setRunningOnly] = useState(false);
  const [draft, setDraft] = useState<ManagedScript | null>(null);
  const [draftDirty, setDraftDirty] = useState(false);
  const [logsByScript, setLogsByScript] = useState<Record<string, ScriptLogEntry[]>>({});
  const [runtimeByScript, setRuntimeByScript] = useState<Record<string, ScriptRuntimeState>>({});
  const [logQuery, setLogQuery] = useState("");
  const [logLevel, setLogLevel] = useState<ScriptLogLevel | "all">("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [apiSearch, setApiSearch] = useState("");
  const [showUnsafe, setShowUnsafe] = useState(false);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [scriptContextMenu, setScriptContextMenu] = useState<ScriptContextMenuState | null>(null);
  const [scriptContextPos, setScriptContextPos] = useState<{ left: number; top: number } | null>(null);

  const scriptsRef = useRef<ManagedScript[]>([]);
  const workersRef = useRef<Map<string, WorkerRuntime>>(new Map());
  const selectedRef = useRef<string | null>(null);
  const autoStartDoneRef = useRef(false);
  const scriptSecurityRef = useRef<Record<string, string>>({});
  const importRef = useRef<HTMLInputElement>(null);
  const newMenuRef = useRef<HTMLDivElement>(null);
  const scriptContextRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const latestLogIdRef = useRef<string | null>(null);
  const snapshotRef = useRef<ScriptWindowSnapshot>({
    ts: 0,
    placeId: "",
    jobId: "",
    launchData: "",
    selectedUserIds: [],
    accounts: [],
    presenceByUserId: {},
    launchedUserIds: [],
    botting: null,
    settings: null,
  });

  useEffect(() => {
    scriptsRef.current = scripts;
  }, [scripts]);

  const selectedScript = useMemo(() => {
    if (!selectedId) return null;
    return scripts.find((script) => script.id === selectedId) || null;
  }, [scripts, selectedId]);

  const contextScript = useMemo(() => {
    if (!scriptContextMenu) return null;
    return scripts.find((script) => script.id === scriptContextMenu.scriptId) || null;
  }, [scripts, scriptContextMenu]);

  const contextScriptRuntime = useMemo(() => {
    if (!contextScript) return createInitialRuntime();
    return runtimeByScript[contextScript.id] || createInitialRuntime();
  }, [contextScript, runtimeByScript]);

  function closeScriptContextMenu() {
    setScriptContextMenu(null);
    setScriptContextPos(null);
  }

  const scriptWindowSnapshot = useMemo<ScriptWindowSnapshot>(() => {
    return {
      ts: Date.now(),
      placeId: store.placeId,
      jobId: store.jobId,
      launchData: store.launchData,
      selectedUserIds: [...store.selectedIds],
      accounts: store.accounts.map((account) => ({
        userId: account.UserID,
        username: account.Username,
        alias: account.Alias,
        group: account.Group,
        valid: account.Valid,
        lastUse: account.LastUse,
        lastAttemptedRefresh: account.LastAttemptedRefresh,
      })),
      presenceByUserId: Object.fromEntries(
        [...store.presenceByUserId.entries()].map(([key, value]) => [String(key), value])
      ),
      launchedUserIds: [...store.launchedByProgram],
      botting: store.bottingStatus,
      settings: store.settings,
    };
  }, [
    store.placeId,
    store.jobId,
    store.launchData,
    store.selectedIds,
    store.accounts,
    store.presenceByUserId,
    store.launchedByProgram,
    store.bottingStatus,
    store.settings,
  ]);

  function appendLog(scriptId: string, level: ScriptLogLevel, source: "script" | "host", message: string) {
    const entry: ScriptLogEntry = {
      id: buildId("log"),
      at: Date.now(),
      level,
      source,
      message,
    };
    setLogsByScript((prev) => {
      const next = [...(prev[scriptId] || []), entry];
      if (next.length > 800) {
        next.splice(0, next.length - 800);
      }
      return {
        ...prev,
        [scriptId]: next,
      };
    });
  }

  function updateRuntime(scriptId: string, patch: Partial<ScriptRuntimeState>) {
    setRuntimeByScript((prev) => {
      const existing = prev[scriptId] || createInitialRuntime();
      return {
        ...prev,
        [scriptId]: {
          ...existing,
          ...patch,
        },
      };
    });
  }

  function postWorkerEvent(scriptId: string, event: string, payload: unknown) {
    const runtime = workersRef.current.get(scriptId);
    if (!runtime) return;
    runtime.worker.postMessage({ type: "host-event", event, payload });
  }

  function postEventToAll(event: string, payload: unknown) {
    for (const script of workersRef.current.keys()) {
      postWorkerEvent(script, event, payload);
    }
  }

  function stopScript(scriptId: string, note = true) {
    const runtime = workersRef.current.get(scriptId);
    if (!runtime) return;

    for (const pending of runtime.pending.values()) {
      pending.reject(new Error("Script stopped"));
    }
    runtime.pending.clear();

    for (const socket of runtime.sockets.values()) {
      try {
        socket.close(1000, "script stopped");
      } catch {
      }
    }
    runtime.sockets.clear();

    runtime.worker.postMessage({ type: "stop" });
    runtime.worker.terminate();
    workersRef.current.delete(scriptId);

    if (note) {
      appendLog(scriptId, "info", "host", "Script stopped");
    }
    updateRuntime(scriptId, {
      status: "stopped",
      stoppedAtMs: Date.now(),
      uiElements: [],
    });
  }

  function ensurePermission(script: ManagedScript, permission: keyof ScriptPermissions, action: string, trustRequired: boolean) {
    if (!script.permissions[permission]) {
      throw new Error(`Permission denied for ${action}`);
    }
    if (trustRequired && !script.trusted) {
      throw new Error(`Action ${action} requires trusted mode`);
    }
  }

  async function handleWorkerRequest(scriptId: string, action: string, payload: unknown): Promise<unknown> {
    const script = scriptsRef.current.find((item) => item.id === scriptId);
    if (!script) {
      throw new Error("Script does not exist");
    }

    const data = asRecord(payload);

    if (action === "invoke") {
      ensurePermission(script, "allowInvoke", "invoke", true);
      const command = String(data.command || "").trim();
      if (!command) {
        throw new Error("Missing invoke command");
      }
      const argsRaw = data.args;
      const args = asRecord(argsRaw);
      return invoke(command, args);
    }

    if (action === "http.request") {
      ensurePermission(script, "allowHttp", "http", true);

      const url = String(data.url || "").trim();
      if (!url) {
        throw new Error("Missing request URL");
      }

      const method = String(data.method || "GET").toUpperCase();
      const timeoutMs = Math.max(500, Number(data.timeoutMs || 10000));
      const headersRaw = asRecord(data.headers);
      const headers = new Headers();
      for (const [key, value] of Object.entries(headersRaw)) {
        headers.set(key, String(value));
      }

      let body: BodyInit | undefined;
      if (data.body !== undefined && data.body !== null) {
        if (typeof data.body === "string") {
          body = data.body;
        } else {
          body = JSON.stringify(data.body);
          if (!headers.has("content-type")) {
            headers.set("content-type", "application/json");
          }
        }
      }

      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          method,
          headers,
          body,
          signal: controller.signal,
        });
        const text = await response.text();
        let json: unknown = null;
        if (text.trim().length > 0) {
          try {
            json = JSON.parse(text);
          } catch {
            json = null;
          }
        }
        return {
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          url: response.url,
          headers: Object.fromEntries(response.headers.entries()),
          text,
          json,
        };
      } finally {
        window.clearTimeout(timer);
      }
    }

    if (action === "ws.connect") {
      ensurePermission(script, "allowWebSocket", "ws.connect", true);
      const runtime = workersRef.current.get(scriptId);
      if (!runtime) {
        throw new Error("Script runtime is not active");
      }

      const url = normalizeWebSocketUrl(String(data.url || ""));
      const requestedId = String(data.connectionId || "").trim();
      const connectionId = requestedId || buildId("ws");

      if (runtime.sockets.has(connectionId)) {
        throw new Error(`WebSocket connection already exists: ${connectionId}`);
      }

      const protocolsInput = data.protocols;
      let socket: WebSocket;
      if (Array.isArray(protocolsInput)) {
        const protocols = protocolsInput
          .map((entry) => String(entry || "").trim())
          .filter((entry) => entry.length > 0);
        socket = protocols.length > 0 ? new WebSocket(url, protocols) : new WebSocket(url);
      } else if (typeof protocolsInput === "string" && protocolsInput.trim().length > 0) {
        socket = new WebSocket(url, protocolsInput.trim());
      } else {
        socket = new WebSocket(url);
      }

      runtime.sockets.set(connectionId, socket);

      socket.onopen = () => {
        appendLog(scriptId, "info", "host", `WS open ${connectionId} -> ${url}`);
        postWorkerEvent(scriptId, "ws", {
          event: "open",
          connectionId,
          url,
          state: wsStateLabel(socket.readyState),
        });
      };

      socket.onerror = () => {
        appendLog(scriptId, "warn", "host", `WS error ${connectionId}`);
        postWorkerEvent(scriptId, "ws", {
          event: "error",
          connectionId,
          url,
          state: wsStateLabel(socket.readyState),
        });
      };

      socket.onclose = (event) => {
        runtime.sockets.delete(connectionId);
        appendLog(
          scriptId,
          "info",
          "host",
          `WS close ${connectionId} (code=${event.code}${event.reason ? `, reason=${event.reason}` : ""})`
        );
        postWorkerEvent(scriptId, "ws", {
          event: "close",
          connectionId,
          url,
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
          state: wsStateLabel(socket.readyState),
        });
      };

      socket.onmessage = async (event) => {
        const payload = await wsMessageToPayload(event.data);
        const dataType =
          typeof event.data === "string"
            ? "text"
            : event.data instanceof Blob
              ? "blob"
              : event.data instanceof ArrayBuffer
                ? "arrayBuffer"
                : typeof event.data;
        postWorkerEvent(scriptId, "ws", {
          event: "message",
          connectionId,
          url,
          dataType,
          text: payload.text,
          json: payload.json,
          state: wsStateLabel(socket.readyState),
        });
      };

      return {
        connectionId,
        url,
        state: wsStateLabel(socket.readyState),
      };
    }

    if (action === "ws.send") {
      ensurePermission(script, "allowWebSocket", "ws.send", true);
      const runtime = workersRef.current.get(scriptId);
      if (!runtime) {
        throw new Error("Script runtime is not active");
      }

      const connectionId = String(data.connectionId || "").trim();
      if (!connectionId) {
        throw new Error("Missing WebSocket connectionId");
      }

      const socket = runtime.sockets.get(connectionId);
      if (!socket) {
        throw new Error(`WebSocket connection not found: ${connectionId}`);
      }

      if (socket.readyState === WebSocket.CONNECTING) {
        await new Promise<void>((resolve, reject) => {
          const timeout = window.setTimeout(() => {
            cleanup();
            reject(new Error(`WebSocket ${connectionId} did not open in time`));
          }, 5000);

          const onOpen = () => {
            cleanup();
            resolve();
          };

          const onClose = () => {
            cleanup();
            reject(new Error(`WebSocket ${connectionId} closed before open`));
          };

          const onError = () => {
            cleanup();
            reject(new Error(`WebSocket ${connectionId} failed while connecting`));
          };

          const cleanup = () => {
            window.clearTimeout(timeout);
            socket.removeEventListener("open", onOpen);
            socket.removeEventListener("close", onClose);
            socket.removeEventListener("error", onError);
          };

          socket.addEventListener("open", onOpen, { once: true });
          socket.addEventListener("close", onClose, { once: true });
          socket.addEventListener("error", onError, { once: true });
        });
      }

      if (socket.readyState !== WebSocket.OPEN) {
        throw new Error(`WebSocket ${connectionId} is ${wsStateLabel(socket.readyState)}`);
      }

      const frame = data.data;
      if (typeof frame === "string") {
        socket.send(frame);
      } else if (frame instanceof ArrayBuffer) {
        socket.send(frame);
      } else if (ArrayBuffer.isView(frame)) {
        socket.send(frame);
      } else {
        socket.send(JSON.stringify(frame ?? null));
      }

      return {
        connectionId,
        state: wsStateLabel(socket.readyState),
      };
    }

    if (action === "ws.close") {
      ensurePermission(script, "allowWebSocket", "ws.close", true);
      const runtime = workersRef.current.get(scriptId);
      if (!runtime) {
        throw new Error("Script runtime is not active");
      }

      const connectionId = String(data.connectionId || "").trim();
      const code = typeof data.code === "number" ? data.code : undefined;
      const reason = typeof data.reason === "string" ? data.reason : undefined;

      if (connectionId) {
        const socket = runtime.sockets.get(connectionId);
        if (!socket) {
          throw new Error(`WebSocket connection not found: ${connectionId}`);
        }
        socket.close(code, reason);
        return true;
      }

      for (const socket of runtime.sockets.values()) {
        socket.close(code, reason);
      }
      return true;
    }

    if (action === "ws.list") {
      ensurePermission(script, "allowWebSocket", "ws.list", false);
      const runtime = workersRef.current.get(scriptId);
      if (!runtime) {
        return [];
      }
      return [...runtime.sockets.entries()].map(([connectionId, socket]) => ({
        connectionId,
        url: socket.url,
        state: wsStateLabel(socket.readyState),
      }));
    }

    if (action === "window.snapshot") {
      ensurePermission(script, "allowWindow", "window.snapshot", false);
      return snapshotRef.current;
    }

    if (action === "window.accounts") {
      ensurePermission(script, "allowWindow", "window.accounts", false);
      return snapshotRef.current.accounts;
    }

    if (action === "window.selected") {
      ensurePermission(script, "allowWindow", "window.selected", false);
      return snapshotRef.current.selectedUserIds;
    }

    if (action === "settings.get") {
      ensurePermission(script, "allowSettings", "settings.get", false);
      const key = String(data.key || "").trim();
      if (!key) throw new Error("Missing settings key");
      const section = `Script.${script.id}`;
      const value = await invoke<string | null>("get_setting", {
        section,
        key,
      });
      return value === null ? data.defaultValue ?? null : value;
    }

    if (action === "settings.set") {
      ensurePermission(script, "allowSettings", "settings.set", true);
      const key = String(data.key || "").trim();
      if (!key) throw new Error("Missing settings key");
      const section = `Script.${script.id}`;
      await invoke("update_setting", {
        section,
        key,
        value: String(data.value ?? ""),
      });
      return true;
    }

    if (action === "settings.all") {
      ensurePermission(script, "allowSettings", "settings.all", false);
      const all = await invoke<Record<string, Record<string, string>>>("get_all_settings");
      return all[`Script.${script.id}`] || {};
    }

    if (action === "modal.alert") {
      ensurePermission(script, "allowModal", "modal.alert", false);
      const title = typeof data.title === "string" ? data.title : script.name;
      const message = typeof data.message === "string" ? data.message : safeMessage(payload);
      const accepted = await confirm(`${title}\n\n${message}`, false);
      return accepted;
    }

    if (action === "modal.confirm") {
      ensurePermission(script, "allowModal", "modal.confirm", false);
      const title = typeof data.title === "string" ? data.title : script.name;
      const message = typeof data.message === "string" ? data.message : "Continue?";
      return confirm(`${title}\n\n${message}`, false);
    }

    if (action === "modal.prompt") {
      ensurePermission(script, "allowModal", "modal.prompt", false);
      const message = typeof data.message === "string" ? data.message : "Input";
      const defaultValue = typeof data.defaultValue === "string" ? data.defaultValue : "";
      return prompt(message, defaultValue);
    }

    if (action === "modal.json") {
      ensurePermission(script, "allowModal", "modal.json", false);
      const title = typeof data.title === "string" ? data.title : `${script.name} Data`;
      const json = JSON.stringify(data.data ?? payload, null, 2);
      store.showModal(title, json);
      return true;
    }

    if (action === "ui.set") {
      ensurePermission(script, "allowUi", "ui.set", false);
      const elements = normalizeUiElements(data.elements);
      updateRuntime(scriptId, { uiElements: elements });
      return true;
    }

    if (action === "ui.patch") {
      ensurePermission(script, "allowUi", "ui.patch", false);
      const id = String(data.id || "").trim();
      if (!id) throw new Error("Missing UI element id");
      setRuntimeByScript((prev) => {
        const current = prev[scriptId] || createInitialRuntime();
        return {
          ...prev,
          [scriptId]: {
            ...current,
            uiElements: applyUiPatch(current.uiElements, id, data.patch),
          },
        };
      });
      return true;
    }

    if (action === "ui.clear") {
      ensurePermission(script, "allowUi", "ui.clear", false);
      updateRuntime(scriptId, { uiElements: [] });
      return true;
    }

    throw new Error(`Unknown action: ${action}`);
  }

  function handleWorkerMessage(scriptId: string, messageRaw: unknown) {
    const message = messageRaw as WorkerIncomingMessage & Record<string, unknown>;

    if (message.type === "host-log") {
      appendLog(scriptId, message.level || "info", "script", String(message.message || ""));
      return;
    }

    if (message.type === "script-finished") {
      appendLog(scriptId, "info", "host", "Script finished");
      stopScript(scriptId, false);
      updateRuntime(scriptId, {
        status: "stopped",
        stoppedAtMs: Date.now(),
      });
      return;
    }

    if (message.type === "script-error") {
      const errorText = String(message.error || "Unknown script error");
      appendLog(scriptId, "error", "host", errorText);
      stopScript(scriptId, false);
      updateRuntime(scriptId, {
        status: "error",
        stoppedAtMs: Date.now(),
        lastError: errorText,
      });
      return;
    }

    if (message.type === "host-request") {
      const runtime = workersRef.current.get(scriptId);
      if (!runtime) return;
      const requestId = String(message.requestId || "");
      const action = String(message.action || "");

      if (!requestId || !action) {
        return;
      }

      handleWorkerRequest(scriptId, action, message.payload)
        .then((result) => {
          runtime.worker.postMessage({
            type: "host-response",
            requestId,
            ok: true,
            result,
          });
        })
        .catch((error) => {
          const errorText = safeMessage(error);
          appendLog(scriptId, "warn", "host", `${action} -> ${errorText}`);
          runtime.worker.postMessage({
            type: "host-response",
            requestId,
            ok: false,
            error: errorText,
          });
        });
    }
  }

  function startScript(scriptId: string) {
    const script = scriptsRef.current.find((item) => item.id === scriptId);
    if (!script) return;
    if (!script.enabled) {
      appendLog(scriptId, "warn", "host", "Cannot start disabled script");
      return;
    }

    stopScript(scriptId, false);
    const worker = createScriptWorker();
    const runtime: WorkerRuntime = {
      worker,
      pending: new Map(),
      sockets: new Map(),
    };
    workersRef.current.set(scriptId, runtime);

    worker.onmessage = (event) => {
      handleWorkerMessage(scriptId, event.data);
    };

    worker.onerror = (event) => {
      const text = event.message || "Worker crashed";
      appendLog(scriptId, "error", "host", text);
      stopScript(scriptId, false);
      updateRuntime(scriptId, {
        status: "error",
        lastError: text,
        stoppedAtMs: Date.now(),
      });
    };

    appendLog(scriptId, "info", "host", `Starting ${script.name}`);
    updateRuntime(scriptId, {
      status: "running",
      startedAtMs: Date.now(),
      stoppedAtMs: null,
      lastError: null,
      uiElements: [],
    });

    worker.postMessage({
      type: "start",
      code: script.source,
      metadata: {
        id: script.id,
        name: script.name,
        trusted: script.trusted,
        permissions: script.permissions,
      },
    });

    worker.postMessage({
      type: "host-event",
      event: "window:update",
      payload: snapshotRef.current,
    });
  }

  async function loadScripts() {
    try {
      const fetched = await invoke<ManagedScript[]>("get_scripts");
      const normalized = fetched.map(normalizeScript);
      setScripts(normalized);
      if (!selectedRef.current && normalized.length > 0) {
        selectedRef.current = normalized[0].id;
        setSelectedId(normalized[0].id);
      }
    } catch (error) {
      store.setError(String(error));
    } finally {
      setLoaded(true);
    }
  }

  async function persistScript(script: ManagedScript): Promise<ManagedScript | null> {
    try {
      const saved = await invoke<ManagedScript>("save_script", { script });
      const normalized = normalizeScript(saved);
      setScripts((prev) => {
        const exists = prev.some((item) => item.id === normalized.id);
        if (!exists) {
          return [...prev, normalized].sort((a, b) => a.name.localeCompare(b.name));
        }
        return prev
          .map((item) => (item.id === normalized.id ? normalized : item))
          .sort((a, b) => a.name.localeCompare(b.name));
      });
      return normalized;
    } catch (error) {
      store.setError(String(error));
      return null;
    }
  }

  useEffect(() => {
    loadScripts();
    return () => {
      for (const id of [...workersRef.current.keys()]) {
        stopScript(id, false);
      }
    };
  }, []);

  useEffect(() => {
    snapshotRef.current = scriptWindowSnapshot;
    postEventToAll("window:update", scriptWindowSnapshot);
  }, [scriptWindowSnapshot]);

  useEffect(() => {
    if (!loaded || autoStartDoneRef.current) {
      return;
    }
    autoStartDoneRef.current = true;
    for (const script of scriptsRef.current) {
      if (script.enabled && script.autoStart) {
        startScript(script.id);
      }
    }
  }, [loaded, scripts]);

  useEffect(() => {
    if (!loaded) return;

    for (const script of scripts) {
      if (!script.enabled) {
        stopScript(script.id, false);
      }
    }

    for (const id of [...workersRef.current.keys()]) {
      if (!scripts.some((item) => item.id === id)) {
        stopScript(id, false);
      }
    }
  }, [loaded, scripts]);

  useEffect(() => {
    if (!loaded) return;

    const nextSecurity: Record<string, string> = {};

    for (const script of scripts) {
      const signature = getScriptSecuritySignature(script);
      const prevSignature = scriptSecurityRef.current[script.id];
      nextSecurity[script.id] = signature;

      if (prevSignature && prevSignature !== signature && workersRef.current.has(script.id)) {
        appendLog(script.id, "warn", "host", "Script trust/permissions changed, stopping runtime");
        stopScript(script.id, false);
      }
    }

    scriptSecurityRef.current = nextSecurity;
  }, [loaded, scripts]);

  useEffect(() => {
    if (!selectedScript) {
      setDraft(null);
      setDraftDirty(false);
      selectedRef.current = null;
      return;
    }

    if (selectedRef.current !== selectedScript.id) {
      selectedRef.current = selectedScript.id;
      setDraft({ ...selectedScript });
      setDraftDirty(false);
      return;
    }

    if (!draftDirty) {
      setDraft({ ...selectedScript });
    }
  }, [selectedScript, draftDirty]);

  useEffect(() => {
    if (!visible) {
      setNewMenuOpen(false);
    }
  }, [visible]);

  useEffect(() => {
    if (!newMenuOpen) return;

    function handleMouseDown(event: MouseEvent) {
      if (newMenuRef.current && !newMenuRef.current.contains(event.target as Node)) {
        setNewMenuOpen(false);
      }
    }

    function handleEsc(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setNewMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [newMenuOpen]);

  useEffect(() => {
    if (!scriptContextMenu) return;

    function handleMouseDown(event: MouseEvent) {
      if (scriptContextRef.current && !scriptContextRef.current.contains(event.target as Node)) {
        closeScriptContextMenu();
      }
    }

    function handleEsc(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeScriptContextMenu();
      }
    }

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [scriptContextMenu]);

  useLayoutEffect(() => {
    if (!scriptContextMenu) return;
    const el = scriptContextRef.current;
    if (!el) return;

    const pad = 8;
    const width = el.offsetWidth || 220;
    const height = el.offsetHeight || 260;
    const left = Math.max(pad, Math.min(scriptContextMenu.x, window.innerWidth - width - pad));
    const top = Math.max(pad, Math.min(scriptContextMenu.y, window.innerHeight - height - pad));
    setScriptContextPos({ left, top });
  }, [scriptContextMenu, contextScriptRuntime.status]);

  const filteredScripts = useMemo(() => {
    const lower = query.trim().toLowerCase();
    const all = scripts.filter((script) => {
      const runtime = runtimeByScript[script.id];
      if (runningOnly && runtime?.status !== "running") {
        return false;
      }
      if (!lower) return true;
      return (
        script.name.toLowerCase().includes(lower) ||
        script.description.toLowerCase().includes(lower)
      );
    });
    return all.sort((a, b) => a.name.localeCompare(b.name));
  }, [scripts, runtimeByScript, query, runningOnly]);

  const selectedRuntime = selectedId ? runtimeByScript[selectedId] : null;
  const selectedLogs = selectedId ? logsByScript[selectedId] || [] : [];
  const selectedUi = selectedRuntime?.uiElements || [];
  const [stickLogsToBottom, setStickLogsToBottom] = useState(true);

  const visibleLogs = useMemo(() => {
    const lower = logQuery.trim().toLowerCase();
    return selectedLogs.filter((log) => {
      if (logLevel !== "all" && log.level !== logLevel) {
        return false;
      }
      if (!lower) return true;
      return log.message.toLowerCase().includes(lower);
    });
  }, [selectedLogs, logLevel, logQuery]);

  function isNearLogBottom(element: HTMLDivElement): boolean {
    const delta = element.scrollHeight - element.scrollTop - element.clientHeight;
    return delta <= 28;
  }

  function scrollLogsToBottom(behavior: ScrollBehavior) {
    const element = logsContainerRef.current;
    if (!element) return;
    element.scrollTo({
      top: element.scrollHeight,
      behavior,
    });
  }

  function handleLogsScroll() {
    const element = logsContainerRef.current;
    if (!element) return;
    setStickLogsToBottom(isNearLogBottom(element));
  }

  useEffect(() => {
    if (tab !== "logs") return;
    latestLogIdRef.current = null;
    setStickLogsToBottom(true);
    window.requestAnimationFrame(() => {
      scrollLogsToBottom("auto");
    });
  }, [selectedId, tab]);

  useEffect(() => {
    if (tab !== "logs") return;
    if (!stickLogsToBottom) return;
    if (visibleLogs.length === 0) return;

    const latestId = visibleLogs[visibleLogs.length - 1]?.id || null;
    if (!latestId || latestLogIdRef.current === latestId) {
      return;
    }

    latestLogIdRef.current = latestId;
    window.requestAnimationFrame(() => {
      scrollLogsToBottom("smooth");
    });
  }, [visibleLogs, tab, stickLogsToBottom]);

  const commandList = useMemo(() => {
    const commands = [
      "get_accounts",
      "update_account",
      "launch_roblox",
      "launch_multiple",
      "cmd_kill_roblox",
      "cmd_kill_all_roblox",
      "get_presence",
      "start_botting_mode",
      "stop_botting_mode",
      "start_web_server",
      "stop_web_server",
      "start_nexus_server",
      "stop_nexus_server",
      "nexus_send_command",
      "get_all_settings",
      "update_setting",
      "get_theme",
    ];
    const q = apiSearch.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((command) => command.toLowerCase().includes(q));
  }, [apiSearch]);

  async function handleCreate(kind: "blank" | "monitor" | "discord") {
    const name =
      (await prompt(
        kind === "discord"
          ? "Script name"
          : kind === "monitor"
            ? "Script name"
            : "Script name",
        kind === "discord"
          ? "Discord Bridge"
          : kind === "monitor"
            ? "Window Monitor"
            : "New Script"
      )) || "";

    const trimmed = name.trim();
    if (!trimmed) return;

    const script =
      kind === "discord"
        ? createScript(trimmed, "Send account presence to a local Discord bot bridge.", DISCORD_BRIDGE_TEMPLATE)
        : kind === "monitor"
          ? createScript(trimmed, "Watch app state, react to UI actions, and call commands.", DEFAULT_SCRIPT_SOURCE)
          : createScript(trimmed, "", "ram.info(\"Hello from script\");\n");

    const saved = await persistScript(script);
    if (!saved) return;
    setSelectedId(saved.id);
    setDraft({ ...saved });
    setDraftDirty(false);
  }

  async function handleSaveDraft() {
    if (!draft) return;
    setBusyId(draft.id);
    const next: ManagedScript = {
      ...draft,
      source: sanitizeScriptSourceForSave(draft.source),
      updatedAtMs: Date.now(),
    };

    const saved = await persistScript(next);
    setBusyId(null);
    if (!saved) return;
    setDraft({ ...saved });
    setDraftDirty(false);
    appendLog(saved.id, "info", "host", "Script saved");
    store.addToast(t("Script saved"));
  }

  async function handleDeleteScript(scriptId: string) {
    const item = scripts.find((script) => script.id === scriptId);
    if (!item) return;

    const approved = await confirm(`Delete script \"${item.name}\"?`, true);
    if (!approved) return;

    stopScript(scriptId, false);

    try {
      await invoke<boolean>("delete_script", { scriptId });
      setScripts((prev) => prev.filter((script) => script.id !== scriptId));
      setLogsByScript((prev) => {
        const next = { ...prev };
        delete next[scriptId];
        return next;
      });
      setRuntimeByScript((prev) => {
        const next = { ...prev };
        delete next[scriptId];
        return next;
      });
      if (selectedId === scriptId) {
        const remaining = scripts.filter((script) => script.id !== scriptId);
        setSelectedId(remaining[0]?.id || null);
      }
    } catch (error) {
      store.setError(String(error));
    }
  }

  async function handleTrustToggle(script: ManagedScript, nextTrusted: boolean) {
    if (nextTrusted) {
      const approved = await confirm(
        "Trusting a script allows command calls, HTTP access, and settings writes. Continue?",
        true
      );
      if (!approved) return;
    }
    const next = { ...script, trusted: nextTrusted, updatedAtMs: Date.now() };
    const saved = await persistScript(next);
    if (!saved) return;
    if (draft?.id === saved.id) {
      setDraft(saved);
      setDraftDirty(false);
    }
    appendLog(saved.id, "info", "host", nextTrusted ? "Trusted mode enabled" : "Trusted mode disabled");
  }

  async function handleToggleEnabled(script: ManagedScript, enabled: boolean) {
    const next = { ...script, enabled, updatedAtMs: Date.now() };
    const saved = await persistScript(next);
    if (!saved) return;
    if (!enabled) {
      stopScript(saved.id, true);
    }
  }

  function updateDraft(updater: (prev: ManagedScript) => ManagedScript) {
    setDraft((prev) => {
      if (!prev) return prev;
      return updater(prev);
    });
    setDraftDirty(true);
  }

  async function handleRunScript(scriptId: string) {
    const script = scripts.find((item) => item.id === scriptId);
    if (!script) return;
    if (!script.enabled) {
      store.addToast(t("Enable the script before running"));
      return;
    }
    startScript(scriptId);
  }

  function handleRestartScript(scriptId: string) {
    stopScript(scriptId, false);
    startScript(scriptId);
  }

  function handleUiEvent(scriptId: string, payload: Record<string, unknown>) {
    postWorkerEvent(scriptId, "ui", payload);
  }

  async function handleImportScript(file: File) {
    try {
      const text = await file.text();
      const name = file.name.replace(/\.[^.]+$/, "") || "Imported Script";
      const script = createScript(name, "Imported from file", sanitizeScriptSourceForSave(text));
      const saved = await persistScript(script);
      if (!saved) return;
      setSelectedId(saved.id);
      setDraft(saved);
      setDraftDirty(false);
    } catch (error) {
      store.setError(String(error));
    }
  }

  async function handleExportScript(script: ManagedScript) {
    const fileName = `${script.name.replace(/[^a-zA-Z0-9-_]/g, "_") || "script"}.js`;
    const savePickerApi = window as Window & SavePickerApi;

    if (typeof savePickerApi.showSaveFilePicker === "function") {
      try {
        const handle = await savePickerApi.showSaveFilePicker({
          suggestedName: fileName,
          types: [
            {
              description: "JavaScript",
              accept: {
                "text/javascript": [".js"],
              },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(script.source);
        await writable.close();
        store.addToast(t("Script exported"));
        return;
      } catch (error) {
        const msg = String(error || "");
        if (msg.toLowerCase().includes("abort")) {
          return;
        }
      }
    }

    try {
      const blob = new Blob([script.source], { type: "text/javascript;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      store.addToast(t("Script export started"));
      return;
    } catch {
    }

    try {
      await navigator.clipboard.writeText(script.source);
      store.addToast(t("Export fallback: source copied to clipboard"));
      store.showModal(`${script.name} Export`, script.source);
    } catch (error) {
      store.setError(String(error));
    }
  }

  async function handleDuplicateScript(script: ManagedScript) {
    const duplicated: ManagedScript = {
      ...script,
      id: buildId("script"),
      name: `${script.name} Copy`,
      trusted: false,
      enabled: false,
      autoStart: false,
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
    };
    const saved = await persistScript(duplicated);
    if (!saved) return;
    setSelectedId(saved.id);
    setDraft({ ...saved });
    setDraftDirty(false);
    appendLog(saved.id, "info", "host", "Script duplicated");
  }

  async function handleCopyApiSnippet() {
    const snippet = `
await ram.invoke("get_accounts", {});
const snapshot = await ram.window.snapshot();
const response = await ram.http.get("http://127.0.0.1:3847/health");
const socket = await ram.ws.connect({ url: "ws://127.0.0.1:3847/ram" });
await ram.ws.send(socket.connectionId, { type: "ping" });
await ram.settings.set("endpoint", "http://127.0.0.1:3847/ram/bridge");
`;
    await navigator.clipboard.writeText(snippet.trim());
    store.addToast(t("Snippet copied"));
  }

  function renderStatusChip(script: ManagedScript) {
    const runtime = runtimeByScript[script.id] || createInitialRuntime();
    const status = runtime.status;
    const className =
      status === "running"
        ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
        : status === "error"
          ? "border-red-500/30 bg-red-500/15 text-red-300"
          : "theme-border bg-zinc-800/40 text-zinc-400";
    return (
      <span className={`px-1.5 py-0.5 text-[10px] rounded-md border ${className}`}>
        {status.toUpperCase()}
      </span>
    );
  }

  const scriptContextItems: MenuItem[] = contextScript
    ? [
        {
          label: contextScriptRuntime.status === "running" ? "Stop" : "Run",
          action: () => {
            if (contextScriptRuntime.status === "running") {
              stopScript(contextScript.id, true);
            } else {
              void handleRunScript(contextScript.id);
            }
          },
        },
        {
          label: "Restart",
          action: () => {
            handleRestartScript(contextScript.id);
          },
        },
        { separator: true, label: "" },
        {
          label: contextScript.enabled ? "Disable" : "Enable",
          action: () => {
            void handleToggleEnabled(contextScript, !contextScript.enabled);
          },
        },
        {
          label: contextScript.trusted ? "Untrust Script" : "Trust Script",
          action: () => {
            void handleTrustToggle(contextScript, !contextScript.trusted);
          },
        },
        { separator: true, label: "" },
        {
          label: "Duplicate",
          action: () => {
            void handleDuplicateScript(contextScript);
          },
        },
        {
          label: "Export",
          action: () => {
            void handleExportScript(contextScript);
          },
        },
        {
          label: "Delete",
          className: "text-red-400",
          action: () => {
            void handleDeleteScript(contextScript.id);
          },
        },
      ]
    : [];

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-[70] flex items-center justify-center bg-black/65 backdrop-blur-sm ${
        closing ? "animate-fade-out" : "animate-fade-in"
      }`}
      onClick={handleClose}
    >
      <div
        className={`theme-modal-scope theme-panel theme-border w-[1100px] h-[720px] max-w-[calc(100vw-20px)] max-h-[calc(100vh-20px)] rounded-2xl border shadow-2xl overflow-hidden flex flex-col ${
          closing ? "animate-scale-out" : "animate-scale-in"
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-5 py-3 border-b theme-border flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-zinc-100">{t("Scripts")}</div>
            <div className="text-[11px] text-zinc-500 truncate">
              {t("Trusted JavaScript automation with UI, modal, settings, and HTTP support")}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleClose}
              className="p-1 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              <X size={16} strokeWidth={2} />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex">
          <aside className="w-[320px] border-r theme-border flex flex-col min-h-0">
            <div className="p-3 border-b theme-border flex items-center gap-2">
              <div className="relative flex-1">
                <Search
                  size={13}
                  strokeWidth={1.9}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600"
                />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="w-full pl-8 pr-2.5 py-1.5 rounded-lg bg-zinc-800/50 border border-zinc-700/60 text-[12px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
                  placeholder={t("Search scripts")}
                />
              </div>
              <button
                onClick={() => setRunningOnly((prev) => !prev)}
                className={`px-2 py-1.5 rounded-lg border text-[11px] transition-colors ${
                  runningOnly
                    ? "bg-sky-500/15 border-sky-500/35 text-sky-300"
                    : "bg-zinc-800/40 border-zinc-700/60 text-zinc-400"
                }`}
              >
                {t("Running")}
              </button>
            </div>

            <div className="px-3 py-2 border-b theme-border flex items-center gap-1.5">
              <div ref={newMenuRef} className="relative">
                <button
                  onClick={() => setNewMenuOpen((prev) => !prev)}
                  className={`px-2.5 py-1 rounded-md border text-[11px] transition-all duration-200 ${
                    newMenuOpen
                      ? "bg-sky-500/18 border-sky-500/35 text-sky-300 shadow-[0_0_0_1px_rgba(56,189,248,0.2)]"
                      : "bg-zinc-800/40 border-zinc-700/60 text-zinc-300 hover:bg-zinc-700/50 hover:-translate-y-[1px]"
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Plus size={11} strokeWidth={2} />
                    {t("New")}
                    <ChevronDown
                      size={11}
                      strokeWidth={2}
                      className={`transition-transform duration-200 ${newMenuOpen ? "rotate-180" : ""}`}
                    />
                  </span>
                </button>

                {newMenuOpen && (
                  <div className="theme-modal-scope theme-panel theme-border absolute left-0 top-full mt-1.5 w-[230px] rounded-xl border border-zinc-700/60 bg-zinc-900/96 shadow-2xl overflow-hidden origin-top-left animate-scale-in">
                    <button
                      onClick={() => {
                        setNewMenuOpen(false);
                        void handleCreate("blank");
                      }}
                      className="w-full text-left px-3 py-2 text-[12px] text-zinc-200 hover:bg-zinc-800/75 transition-all duration-200"
                    >
                      <span className="inline-flex items-center gap-2">
                        <Plus size={12} strokeWidth={2} className="text-sky-300" />
                        {t("New Script")}
                      </span>
                    </button>

                    <div className="mx-2 my-1 border-t border-zinc-700/70" />

                    <button
                      onClick={() => {
                        setNewMenuOpen(false);
                        void handleCreate("monitor");
                      }}
                      className="w-full text-left px-3 py-2 text-[12px] text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800/70 transition-all duration-200"
                    >
                      {t("Window Monitor Template")}
                    </button>

                    <button
                      onClick={() => {
                        setNewMenuOpen(false);
                        void handleCreate("discord");
                      }}
                      className="w-full text-left px-3 py-2 text-[12px] text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800/70 transition-all duration-200"
                    >
                      {t("Discord Bridge Template")}
                    </button>
                  </div>
                )}
              </div>

              <button
                onClick={() => importRef.current?.click()}
                className="px-2 py-1 rounded-md bg-zinc-800/40 border border-zinc-700/60 text-[11px] text-zinc-300 hover:bg-zinc-700/50 hover:-translate-y-[1px] transition-all duration-200"
              >
                <span className="inline-flex items-center gap-1">
                  <Upload size={11} strokeWidth={2} />
                  {t("Import")}
                </span>
              </button>
              <input
                ref={importRef}
                type="file"
                accept=".js,.txt,.ram-script"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  void handleImportScript(file);
                }}
              />
              <span className="ml-auto text-[11px] text-zinc-600">
                {filteredScripts.length} {t("items")}
              </span>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto">
              {filteredScripts.map((script) => {
                const runtime = runtimeByScript[script.id] || createInitialRuntime();
                const selected = selectedId === script.id;
                return (
                  <button
                    key={script.id}
                    onClick={() => setSelectedId(script.id)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setSelectedId(script.id);
                      setScriptContextPos(null);
                      setScriptContextMenu({
                        scriptId: script.id,
                        x: event.clientX,
                        y: event.clientY,
                      });
                    }}
                    className={`w-full text-left px-3 py-2.5 border-b border-zinc-800/50 transition-all duration-200 ${
                      selected ? "bg-zinc-800/70" : "hover:bg-zinc-800/35 hover:translate-x-[1px]"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] text-zinc-200 font-medium truncate">{script.name}</span>
                      {script.trusted ? (
                        <ShieldCheck size={13} strokeWidth={1.8} className="text-emerald-300 shrink-0" />
                      ) : (
                        <ShieldAlert size={13} strokeWidth={1.8} className="text-amber-300 shrink-0" />
                      )}
                      <span className="ml-auto">{renderStatusChip(script)}</span>
                    </div>
                    <div className="mt-1 text-[10px] text-zinc-500 truncate">
                      {script.description || t("No description")}
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span
                        className={`px-1.5 py-0.5 rounded border text-[10px] ${
                          script.enabled
                            ? "border-emerald-500/25 text-emerald-300 bg-emerald-500/10"
                            : "border-zinc-700 text-zinc-500"
                        }`}
                      >
                        {script.enabled ? t("enabled") : t("disabled")}
                      </span>
                      {runtime.lastError ? (
                        <span className="px-1.5 py-0.5 rounded border text-[10px] border-red-500/30 bg-red-500/12 text-red-300 truncate">
                          {t("error")}
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
              {filteredScripts.length === 0 && (
                <div className="px-4 py-8 text-center text-[12px] text-zinc-500">
                  {loaded ? t("No scripts found") : t("Loading scripts...")}
                </div>
              )}
            </div>
          </aside>

          <section className="flex-1 min-w-0 flex flex-col">
            {!selectedScript || !draft ? (
              <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
                {t("Select a script or create a new one")}
              </div>
            ) : (
              <>
                <div className="px-4 py-3 border-b theme-border flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <input
                      value={draft.name}
                      onChange={(event) =>
                        updateDraft((prev) => ({ ...prev, name: event.target.value }))
                      }
                      className="w-full bg-transparent text-[15px] font-semibold text-zinc-100 outline-none"
                    />
                    <input
                      value={draft.description}
                      onChange={(event) =>
                        updateDraft((prev) => ({ ...prev, description: event.target.value }))
                      }
                      placeholder={t("Description")}
                      className="w-full mt-0.5 bg-transparent text-[12px] text-zinc-500 outline-none placeholder:text-zinc-600"
                    />
                  </div>

                  <button
                    onClick={() => handleToggleEnabled(selectedScript, !selectedScript.enabled)}
                    className={`px-2.5 py-1.5 rounded-lg border text-[11px] transition-colors ${
                      selectedScript.enabled
                        ? "border-emerald-500/35 bg-emerald-500/15 text-emerald-300"
                        : "border-zinc-700 bg-zinc-800/45 text-zinc-400"
                    }`}
                  >
                    {selectedScript.enabled ? t("Enabled") : t("Disabled")}
                  </button>

                  <button
                    onClick={() => {
                      if (workersRef.current.has(selectedScript.id)) {
                        stopScript(selectedScript.id, true);
                      } else {
                        handleRunScript(selectedScript.id);
                      }
                    }}
                    className={`px-2.5 py-1.5 rounded-lg border text-[11px] transition-colors ${
                      workersRef.current.has(selectedScript.id)
                        ? "border-red-500/35 bg-red-500/15 text-red-300"
                        : "border-sky-500/35 bg-sky-500/15 text-sky-300"
                    }`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {workersRef.current.has(selectedScript.id) ? (
                        <Square size={11} strokeWidth={2} />
                      ) : (
                        <Play size={11} strokeWidth={2} />
                      )}
                      {workersRef.current.has(selectedScript.id) ? t("Stop") : t("Run")}
                    </span>
                  </button>

                  <button
                    onClick={() => handleRestartScript(selectedScript.id)}
                    className="px-2.5 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800/45 text-[11px] text-zinc-300 hover:bg-zinc-700 transition-colors"
                  >
                    <span className="inline-flex items-center gap-1">
                      <RotateCcw size={11} strokeWidth={2} />
                      {t("Restart")}
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      void handleExportScript(selectedScript);
                    }}
                    className="px-2.5 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800/45 text-[11px] text-zinc-300 hover:bg-zinc-700 transition-colors"
                  >
                    <span className="inline-flex items-center gap-1">
                      <Download size={11} strokeWidth={2} />
                      {t("Export")}
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      void handleDeleteScript(selectedScript.id);
                    }}
                    className="px-2.5 py-1.5 rounded-lg border border-red-500/35 bg-red-500/12 text-[11px] text-red-300 hover:bg-red-500/20 transition-colors"
                  >
                    <span className="inline-flex items-center gap-1">
                      <Trash2 size={11} strokeWidth={2} />
                      {t("Delete")}
                    </span>
                  </button>
                </div>

                <div className="px-4 py-2 border-b theme-border flex items-center gap-2">
                  {([
                    ["editor", t("Editor")],
                    ["ui", t("UI")],
                    ["logs", t("Logs")],
                    ["api", t("API")],
                  ] as Array<[ScriptTabId, string]>).map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => setTab(id)}
                      className={`px-2.5 py-1 rounded-md text-[11px] border transition-colors ${
                        tab === id
                          ? "border-sky-500/35 bg-sky-500/15 text-sky-300"
                          : "border-zinc-700/70 bg-zinc-800/40 text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      {label}
                    </button>
                  ))}

                  <div className="ml-auto flex items-center gap-2">
                    <button
                      onClick={() => {
                        void handleTrustToggle(selectedScript, !selectedScript.trusted);
                      }}
                      className={`px-2 py-1 rounded-md text-[10px] border transition-colors ${
                        selectedScript.trusted
                          ? "border-emerald-500/35 bg-emerald-500/15 text-emerald-300"
                          : "border-amber-500/35 bg-amber-500/12 text-amber-300"
                      }`}
                    >
                      <span className="inline-flex items-center gap-1">
                        {selectedScript.trusted ? (
                          <ShieldCheck size={11} strokeWidth={2} />
                        ) : (
                          <ShieldAlert size={11} strokeWidth={2} />
                        )}
                        {selectedScript.trusted ? t("Trusted") : t("Untrusted")}
                      </span>
                    </button>

                    <button
                      onClick={() => setShowUnsafe((prev) => !prev)}
                      className="px-2 py-1 rounded-md border border-zinc-700 bg-zinc-800/45 text-[10px] text-zinc-400 hover:text-zinc-200 transition-colors"
                    >
                      {showUnsafe ? t("Hide Unsafe Details") : t("Show Unsafe Details")}
                    </button>
                  </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto p-4">
                  {tab === "editor" && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <PermissionRow
                          label={t("Invoke Rust Commands")}
                          enabled={draft.permissions.allowInvoke}
                          onChange={(value) => {
                            updateDraft((prev) => ({
                              ...prev,
                              permissions: { ...prev.permissions, allowInvoke: value },
                            }));
                          }}
                        />
                        <PermissionRow
                          label={t("HTTP Requests")}
                          enabled={draft.permissions.allowHttp}
                          onChange={(value) => {
                            updateDraft((prev) => ({
                              ...prev,
                              permissions: { ...prev.permissions, allowHttp: value },
                            }));
                          }}
                        />
                        <PermissionRow
                          label={t("WebSocket Connections")}
                          enabled={draft.permissions.allowWebSocket}
                          onChange={(value) => {
                            updateDraft((prev) => ({
                              ...prev,
                              permissions: { ...prev.permissions, allowWebSocket: value },
                            }));
                          }}
                        />
                        <PermissionRow
                          label={t("Window Snapshot")}
                          enabled={draft.permissions.allowWindow}
                          onChange={(value) => {
                            updateDraft((prev) => ({
                              ...prev,
                              permissions: { ...prev.permissions, allowWindow: value },
                            }));
                          }}
                        />
                        <PermissionRow
                          label={t("Modal Access")}
                          enabled={draft.permissions.allowModal}
                          onChange={(value) => {
                            updateDraft((prev) => ({
                              ...prev,
                              permissions: { ...prev.permissions, allowModal: value },
                            }));
                          }}
                        />
                        <PermissionRow
                          label={t("Script Settings")}
                          enabled={draft.permissions.allowSettings}
                          onChange={(value) => {
                            updateDraft((prev) => ({
                              ...prev,
                              permissions: { ...prev.permissions, allowSettings: value },
                            }));
                          }}
                        />
                        <PermissionRow
                          label={t("Custom UI")}
                          enabled={draft.permissions.allowUi}
                          onChange={(value) => {
                            updateDraft((prev) => ({
                              ...prev,
                              permissions: { ...prev.permissions, allowUi: value },
                            }));
                          }}
                        />
                      </div>

                      <div
                        className={`overflow-hidden transition-[max-height,opacity,transform] duration-300 ease-out ${
                          showUnsafe
                            ? "max-h-[260px] opacity-100 translate-y-0"
                            : "max-h-0 opacity-0 -translate-y-1 pointer-events-none"
                        }`}
                      >
                        <div className="rounded-lg border border-zinc-700/70 bg-zinc-900/45 px-3 py-2 text-[11px] space-y-1.5">
                          <div className="text-zinc-300 font-medium tracking-wide">{t("Unsafe capability details")}</div>
                          <div className="text-zinc-500">{t("Effective access is trust mode + permission toggle.")}</div>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-zinc-400">
                            <div>{t("Invoke commands")}</div>
                            <div className={`${draft.trusted && draft.permissions.allowInvoke ? "text-emerald-300" : "text-amber-300"} transition-colors duration-200`}>
                              {draft.permissions.allowInvoke ? (draft.trusted ? t("Allowed") : t("Blocked (untrusted)")) : t("Disabled")}
                            </div>
                            <div>{t("HTTP requests")}</div>
                            <div className={`${draft.trusted && draft.permissions.allowHttp ? "text-emerald-300" : "text-amber-300"} transition-colors duration-200`}>
                              {draft.permissions.allowHttp ? (draft.trusted ? t("Allowed") : t("Blocked (untrusted)")) : t("Disabled")}
                            </div>
                            <div>{t("WebSocket")}</div>
                            <div className={`${draft.trusted && draft.permissions.allowWebSocket ? "text-emerald-300" : "text-amber-300"} transition-colors duration-200`}>
                              {draft.permissions.allowWebSocket ? (draft.trusted ? t("Allowed") : t("Blocked (untrusted)")) : t("Disabled")}
                            </div>
                            <div>{t("Settings write")}</div>
                            <div className={`${draft.trusted && draft.permissions.allowSettings ? "text-emerald-300" : "text-amber-300"} transition-colors duration-200`}>
                              {draft.permissions.allowSettings ? (draft.trusted ? t("Allowed") : t("Blocked (untrusted)")) : t("Disabled")}
                            </div>
                          </div>
                        </div>
                      </div>

                      <label className="flex items-center gap-2 text-[12px] text-zinc-300">
                        <input
                          type="checkbox"
                          checked={draft.autoStart}
                          onChange={(event) =>
                            updateDraft((prev) => ({ ...prev, autoStart: event.target.checked }))
                          }
                          className="h-3.5 w-3.5 accent-sky-500"
                        />
                        {t("Auto start when app launches")}
                      </label>

                      <textarea
                        value={draft.source}
                        onChange={(event) =>
                          updateDraft((prev) => ({ ...prev, source: event.target.value }))
                        }
                        className="w-full h-[360px] resize-none rounded-xl bg-zinc-900 border border-zinc-700/60 text-[12px] text-zinc-200 font-mono leading-relaxed p-3 focus:outline-none focus:border-zinc-500"
                        spellCheck={false}
                      />

                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-zinc-500">
                          {draftDirty
                            ? t("Unsaved changes")
                            : t("Saved at {{time}}", {
                                time: new Date(draft.updatedAtMs).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  second: "2-digit",
                                  hour12: false,
                                }),
                              })}
                        </span>
                        <button
                          onClick={() => {
                            void handleSaveDraft();
                          }}
                          disabled={!draftDirty || busyId === draft.id}
                          className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-[12px] font-medium text-white transition-colors"
                        >
                          {busyId === draft.id ? t("Saving...") : t("Save Script")}
                        </button>
                      </div>
                    </div>
                  )}

                  {tab === "ui" && (
                    <div className="space-y-3">
                      <div className="text-[12px] text-zinc-500">
                        {t("UI defined by script via ram.ui.set(...) appears here.")}
                      </div>
                      <ScriptUiRenderer
                        scriptId={selectedScript.id}
                        elements={selectedUi}
                        onEvent={handleUiEvent}
                        onStateChange={(nextElements) => {
                          updateRuntime(selectedScript.id, { uiElements: nextElements });
                        }}
                      />
                    </div>
                  )}

                  {tab === "logs" && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <Search
                            size={13}
                            strokeWidth={1.9}
                            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600"
                          />
                          <input
                            value={logQuery}
                            onChange={(event) => setLogQuery(event.target.value)}
                            className="w-full pl-8 pr-2.5 py-1.5 rounded-lg bg-zinc-800/50 border border-zinc-700/60 text-[12px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
                            placeholder={t("Search logs")}
                          />
                        </div>
                        <Select
                          value={logLevel}
                          onChange={(value) => setLogLevel(value as ScriptLogLevel | "all")}
                          options={[
                            { value: "all", label: "All" },
                            { value: "debug", label: "Debug" },
                            { value: "info", label: "Info" },
                            { value: "warn", label: "Warn" },
                            { value: "error", label: "Error" },
                          ]}
                          className="w-[130px]"
                        />
                        <button
                          onClick={() => {
                            setLogsByScript((prev) => ({ ...prev, [selectedScript.id]: [] }));
                            setStickLogsToBottom(true);
                          }}
                          className="px-2.5 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800/45 text-[12px] text-zinc-300 hover:bg-zinc-700 transition-colors"
                        >
                          {t("Clear")}
                        </button>
                      </div>

                      <div className="relative">
                        <div
                          ref={logsContainerRef}
                          onScroll={handleLogsScroll}
                          className="rounded-xl border border-zinc-800 bg-zinc-950/40 h-[430px] overflow-y-auto p-2.5 space-y-1"
                        >
                          {visibleLogs.length === 0 && (
                            <div className="text-[12px] text-zinc-600 p-2">{t("No logs")}</div>
                          )}
                          {visibleLogs.map((entry) => (
                            <div
                              key={entry.id}
                              className={`text-[11px] font-mono px-2 py-1 rounded border ${
                                entry.level === "error"
                                  ? "border-red-500/25 bg-red-500/10 text-red-200"
                                  : entry.level === "warn"
                                    ? "border-amber-500/25 bg-amber-500/10 text-amber-200"
                                    : entry.level === "debug"
                                      ? "border-zinc-700/50 bg-zinc-800/30 text-zinc-400"
                                      : "border-zinc-700/50 bg-zinc-800/35 text-zinc-300"
                              }`}
                            >
                              <span className="text-zinc-500 mr-2">
                                {new Date(entry.at).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  second: "2-digit",
                                  hour12: false,
                                })}
                              </span>
                              <span className="mr-2">[{entry.level.toUpperCase()}]</span>
                              <span className="mr-2">[{entry.source}]</span>
                              <span className="break-all">{entry.message}</span>
                            </div>
                          ))}
                        </div>

                        {!stickLogsToBottom && visibleLogs.length > 0 && (
                          <button
                            onClick={() => {
                              setStickLogsToBottom(true);
                              scrollLogsToBottom("smooth");
                            }}
                            className="absolute right-3 bottom-3 px-2.5 py-1 rounded-md border border-sky-500/35 bg-sky-500/18 text-[11px] text-sky-300 hover:bg-sky-500/28 transition-all duration-200"
                          >
                            {t("Jump to latest")}
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {tab === "api" && (
                    <div className="space-y-3">
                      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-[12px] text-zinc-300">
                        <div className="font-medium text-zinc-200 mb-1">{t("Host API")}</div>
                        <div className="text-zinc-400 leading-relaxed">
                          {t("Use ram.invoke(command, args), ram.http.request(...), ram.ws.connect/send/on(...), ram.window.snapshot(), ram.settings.get/set(), ram.modal.confirm(), ram.ui.set().")}
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            onClick={() => {
                              void handleCopyApiSnippet();
                            }}
                            className="px-2.5 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800/45 text-[11px] text-zinc-300 hover:bg-zinc-700 transition-colors"
                          >
                            <span className="inline-flex items-center gap-1">
                              <Copy size={11} strokeWidth={2} />
                              {t("Copy snippet")}
                            </span>
                          </button>
                          <span className="text-[11px] text-zinc-500">
                            {selectedScript.trusted
                              ? t("Trusted mode is enabled")
                              : t("Trusted mode is disabled")}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <Search
                            size={13}
                            strokeWidth={1.9}
                            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600"
                          />
                          <input
                            value={apiSearch}
                            onChange={(event) => setApiSearch(event.target.value)}
                            className="w-full pl-8 pr-2.5 py-1.5 rounded-lg bg-zinc-800/50 border border-zinc-700/60 text-[12px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
                            placeholder={t("Search common command names")}
                          />
                        </div>
                      </div>

                      <div className="rounded-xl border border-zinc-800 bg-zinc-950/35 p-2 h-[420px] overflow-y-auto grid grid-cols-2 gap-1">
                        {commandList.map((command) => (
                          <button
                            key={command}
                            onClick={async () => {
                              await navigator.clipboard.writeText(command);
                              store.addToast(t("Copied {{name}}", { name: command }));
                            }}
                            className="text-left px-2.5 py-1.5 rounded-md border border-zinc-700/50 bg-zinc-800/30 text-[11px] text-zinc-300 hover:bg-zinc-700/50 transition-colors font-mono"
                          >
                            {command}
                          </button>
                        ))}
                        {commandList.length === 0 && (
                          <div className="text-[12px] text-zinc-600 px-2 py-2">{t("No matches")}</div>
                        )}
                      </div>

                      <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3 text-[11px] text-zinc-500 leading-relaxed">
                        <div className="mb-1 text-zinc-300 font-medium">{t("WebSocket helper")}</div>
                        <div>{t("Connect with ram.ws.connect({ url, protocols? }).")}</div>
                        <div>{t("Subscribe with ram.ws.on((evt) => ...).")}</div>
                        <div>{t("Events: open, message, error, close.")}</div>
                        <div>{t("Send data with ram.ws.send(connectionId, payload).")}</div>
                        <div>{t("Close one or all connections with ram.ws.close(...).")}</div>
                      </div>

                      <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3 text-[11px] text-zinc-500 leading-relaxed">
                        <div className="mb-1 text-zinc-300 font-medium">{t("Trust Mode")}</div>
                        <div>
                          {t("Untrusted scripts keep read-only behavior. Trusted scripts can invoke commands, use HTTP/WebSocket, and write script-scoped settings.")}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="px-4 py-2 border-t theme-border flex items-center justify-between gap-3 text-[11px]">
                  <div className="text-zinc-500 flex items-center gap-2">
                    {(selectedRuntime?.status || "idle") === "running" ? (
                      <>
                        <CheckCircle2 size={13} strokeWidth={2} className="text-emerald-300" />
                        <span>{t("Script running")}</span>
                      </>
                    ) : selectedRuntime?.status === "error" ? (
                      <>
                        <AlertCircle size={13} strokeWidth={2} className="text-red-300" />
                        <span className="text-red-300">{selectedRuntime.lastError || t("Script error")}</span>
                      </>
                    ) : (
                      <span>{t("Script idle")}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        if (!draft) return;
                        if (!selectedScript) return;
                        if (!draftDirty) {
                          void handleRunScript(selectedScript.id);
                          return;
                        }
                        void handleSaveDraft().then(() => {
                          handleRunScript(selectedScript.id);
                        });
                      }}
                      className="px-3 py-1.5 rounded-lg border border-sky-500/35 bg-sky-500/15 text-[12px] text-sky-300 hover:bg-sky-500/25 transition-colors"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <Play size={11} strokeWidth={2} />
                        {t("Run latest")}
                      </span>
                    </button>
                    <button
                      onClick={handleClose}
                      className="px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800/45 text-[12px] text-zinc-300 hover:bg-zinc-700 transition-colors"
                    >
                      {t("Close")}
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>

          {scriptContextMenu && contextScript && (
            <div
              ref={scriptContextRef}
              className="theme-modal-scope theme-panel theme-border fixed z-[120] min-w-[220px] bg-zinc-900/95 backdrop-blur-xl border border-zinc-700/50 rounded-xl shadow-2xl py-1.5 animate-scale-in"
              style={{
                left: scriptContextPos?.left ?? scriptContextMenu.x,
                top: scriptContextPos?.top ?? scriptContextMenu.y,
              }}
            >
              {scriptContextItems.map((item, index) => (
                <MenuItemView
                  key={`${contextScript.id}-${index}`}
                  item={item}
                  close={closeScriptContextMenu}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PermissionRow({
  label,
  enabled,
  onChange,
}: {
  label: string;
  enabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className="w-full px-3 py-2 rounded-lg border border-zinc-700/60 bg-zinc-800/35 hover:bg-zinc-700/45 transition-colors text-left"
    >
      <span className="inline-flex items-center gap-2 text-[12px] text-zinc-300">
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            enabled ? "bg-emerald-400" : "bg-zinc-600"
          }`}
        />
        {label}
      </span>
    </button>
  );
}

function ScriptUiRenderer({
  scriptId,
  elements,
  onEvent,
  onStateChange,
}: {
  scriptId: string;
  elements: ScriptUiElement[];
  onEvent: (scriptId: string, payload: Record<string, unknown>) => void;
  onStateChange: (next: ScriptUiElement[]) => void;
}) {
  function updateElementValue(id: string, value: string | number | boolean) {
    const next = elements.map((element) =>
      element.id === id
        ? {
            ...element,
            value,
          }
        : element
    );
    onStateChange(next);
  }

  if (elements.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-700/70 bg-zinc-900/30 p-6 text-center text-[12px] text-zinc-500">
        No custom UI yet
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/35 p-3 space-y-2">
      {elements.map((element) => {
        const widthStyle = element.width ? { width: element.width } : undefined;
        const toneClass =
          element.tone === "success"
            ? "text-emerald-300"
            : element.tone === "warn"
              ? "text-amber-300"
              : element.tone === "error"
                ? "text-red-300"
                : element.tone === "accent"
                  ? "text-sky-300"
                  : "text-zinc-300";

        if (element.type === "divider") {
          return <div key={element.id} className="h-px bg-zinc-700/70" />;
        }

        if (element.type === "badge") {
          return (
            <div
              key={element.id}
              className={`inline-flex px-2 py-1 rounded-md border border-zinc-700/70 bg-zinc-800/50 text-[11px] ${toneClass}`}
            >
              {element.text || element.label || element.id}
            </div>
          );
        }

        if (element.type === "button") {
          return (
            <button
              key={element.id}
              disabled={element.disabled}
              style={widthStyle}
              onClick={() => {
                onEvent(scriptId, {
                  id: element.id,
                  action: "click",
                });
              }}
              className="px-2.5 py-1.5 rounded-md border border-zinc-700 bg-zinc-800/45 text-[12px] text-zinc-200 hover:bg-zinc-700 transition-colors disabled:opacity-50"
            >
              {element.text || element.label || element.id}
            </button>
          );
        }

        if (element.type === "text") {
          return (
            <label key={element.id} className="block text-[11px] text-zinc-400">
              {element.label || element.id}
              <input
                value={typeof element.value === "string" ? element.value : ""}
                disabled={element.disabled}
                onChange={(event) => {
                  const value = event.target.value;
                  updateElementValue(element.id, value);
                  onEvent(scriptId, {
                    id: element.id,
                    action: "change",
                    value,
                  });
                }}
                style={widthStyle}
                placeholder={element.placeholder}
                className="mt-1 w-full px-2 py-1 rounded-md bg-zinc-800/50 border border-zinc-700/70 text-[12px] text-zinc-200 focus:outline-none focus:border-zinc-500"
              />
            </label>
          );
        }

        if (element.type === "textarea") {
          return (
            <label key={element.id} className="block text-[11px] text-zinc-400">
              {element.label || element.id}
              <textarea
                value={typeof element.value === "string" ? element.value : ""}
                disabled={element.disabled}
                rows={element.rows || 3}
                onChange={(event) => {
                  const value = event.target.value;
                  updateElementValue(element.id, value);
                  onEvent(scriptId, {
                    id: element.id,
                    action: "change",
                    value,
                  });
                }}
                style={widthStyle}
                placeholder={element.placeholder}
                className="mt-1 w-full px-2 py-1 rounded-md bg-zinc-800/50 border border-zinc-700/70 text-[12px] text-zinc-200 focus:outline-none focus:border-zinc-500 resize-y"
              />
            </label>
          );
        }

        if (element.type === "number") {
          const current =
            typeof element.value === "number"
              ? element.value
              : Number.parseFloat(String(element.value || "0"));
          return (
            <label key={element.id} className="block text-[11px] text-zinc-400">
              {element.label || element.id}
              <input
                type="number"
                value={Number.isFinite(current) ? current : 0}
                disabled={element.disabled}
                min={element.min}
                max={element.max}
                step={element.step || 1}
                onChange={(event) => {
                  const value = Number.parseFloat(event.target.value || "0");
                  updateElementValue(element.id, Number.isFinite(value) ? value : 0);
                  onEvent(scriptId, {
                    id: element.id,
                    action: "change",
                    value: Number.isFinite(value) ? value : 0,
                  });
                }}
                style={widthStyle}
                className="mt-1 w-full px-2 py-1 rounded-md bg-zinc-800/50 border border-zinc-700/70 text-[12px] text-zinc-200 focus:outline-none focus:border-zinc-500"
              />
            </label>
          );
        }

        if (element.type === "toggle") {
          const checked = Boolean(element.value);
          return (
            <label key={element.id} className="inline-flex items-center gap-2 text-[12px] text-zinc-300">
              <input
                type="checkbox"
                checked={checked}
                disabled={element.disabled}
                onChange={(event) => {
                  const value = event.target.checked;
                  updateElementValue(element.id, value);
                  onEvent(scriptId, {
                    id: element.id,
                    action: "change",
                    value,
                  });
                }}
                className="h-3.5 w-3.5 accent-sky-500"
              />
              {element.label || element.text || element.id}
            </label>
          );
        }

        if (element.type === "select") {
          const value = String(element.value || "");
          return (
            <label key={element.id} className="block text-[11px] text-zinc-400">
              {element.label || element.id}
              <select
                value={value}
                disabled={element.disabled}
                style={widthStyle}
                onChange={(event) => {
                  const next = event.target.value;
                  updateElementValue(element.id, next);
                  onEvent(scriptId, {
                    id: element.id,
                    action: "change",
                    value: next,
                  });
                }}
                className="mt-1 w-full px-2 py-1 rounded-md bg-zinc-800/50 border border-zinc-700/70 text-[12px] text-zinc-200 focus:outline-none focus:border-zinc-500"
              >
                {(element.options || []).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          );
        }

        return (
          <div key={element.id} className="text-[12px] text-zinc-500">
            Unsupported element: {element.type}
          </div>
        );
      })}
    </div>
  );
}
