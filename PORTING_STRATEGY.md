# RAM Cross-Platform Porting Strategy

This document captures the full analysis and decisions for porting Roblox Account Manager to a cross-platform application. Any AI model working on this should read this entire document before starting work.

## Decision: Tauri (Rust + TypeScript)

After evaluating all options, Tauri was chosen as the best framework for the rewrite.

### Why Tauri over alternatives

| Option | Verdict | Reason |
|--------|---------|--------|
| C# Avalonia / MAUI | Rejected | Still fighting .NET ecosystem limitations, Mac process manipulation story is weak |
| Electron + TypeScript | Rejected | Ships entire Chromium (~150MB), overkill for this app |
| Tauri + TypeScript + Rust | **Chosen** | ~10MB app, native WebView, Rust backend handles system-level work natively |
| Staying C# WinForms | Rejected | Windows-only, dated UI, .NET Framework 4.7.2 is a dead end |

### Why Tauri specifically

- Uses the system's native WebView (WebKit on Mac, WebView2 on Windows) - true native citizen on both platforms
- Rust backend handles mutex manipulation, process management, encryption natively without awkward addon bridges
- Frontend is TypeScript + any web framework (React, Svelte, etc.) - enables modern, polished UI
- Memory usage ~20-50MB vs Electron's 150-300MB
- Near-instant startup
- Production-proven (ChatGPT desktop, Sourcegraph Cody, etc.)

### Trade-off accepted

- Drops Windows 7 support (WebView2 requires Windows 10+, but Win7 is EOL anyway)
- Users on Windows 10 may need WebView2 auto-installed (comes preinstalled on Win11)

## Target Architecture

```
Frontend (TypeScript + React/Svelte)
├── UI: Account list, settings, server browser, theme editor
├── State management for accounts, settings
├── All visual/interactive logic
│
↕ Tauri IPC Commands (invoke/listen)
│
Backend (Rust - src-tauri/)
├── Platform Layer
│   ├── windows.rs → Mutex kill (OpenMutex/CloseHandle), process detection, Roblox launch
│   └── macos.rs   → Mac single-instance bypass (NEEDS RESEARCH), process detection, Roblox launch
├── API Layer
│   ├── auth.rs    → CSRF token, .ROBLOSECURITY cookie management, auth tickets
│   ├── roblox.rs  → All Roblox REST API calls (avatar, friends, users, etc.)
│   └── server.rs  → Local HTTP API server (WebServer replacement)
├── Data Layer
│   ├── accounts.rs → Account model, JSON serialization, encryption
│   ├── settings.rs → RAMSettings equivalent
│   └── crypto.rs   → libsodium replacement (use rust-crypto or sodiumoxide crate)
└── Nexus
    └── websocket.rs → WebSocket server for account control
```

## Porting Order (Critical)

This order matters. Do NOT skip ahead.

### Phase 1: Project Scaffold
- Initialize Tauri project with TypeScript frontend
- Set up the IPC command structure
- Get a basic window rendering

### Phase 2: Data Layer (Rust)
- Port Account model from Account.cs
- Port JSON serialization (AccountData.json format must stay compatible for migration)
- Port encryption (must be able to decrypt existing AccountData.json files)
- Port settings loading (RAMSettings.ini, RAMTheme.ini)

### Phase 3: API Layer (Rust)
- Port authentication flow:
  1. CSRF token via `/v1/authentication-ticket/` with lowercase `x-csrf-token` header
  2. `.ROBLOSECURITY` cookie management per account
  3. Automatic cookie refresh
  4. Auth tickets with `launchData` parameter
- Port all REST clients (MainClient, AvatarClient, FriendsClient, UsersClient)
- This is the most sensitive part - auth edge cases and API workarounds MUST be preserved

### Phase 4: Frontend (TypeScript)
- Build the account list UI
- Build settings form
- Build server list browser
- Build all dialogs (import, theme editor, etc.)
- This is where the UI gets a major upgrade over WinForms

### Phase 5: Platform Layer - Windows (Rust)
- Port multi-Roblox (mutex kill via Windows API)
- Port Roblox process detection and launching
- Port launch data / private server joining
- This is a known problem with known solutions, just different syntax in Rust

### Phase 6: Platform Layer - Mac (Rust)
- **REQUIRES MANUAL RESEARCH FIRST** - someone with a Mac must:
  - Determine how Mac Roblox enforces single-instance (file locks? launchd? Unix domain sockets?)
  - Determine how Mac Roblox accepts auth tickets (roblox-player:// URL scheme?)
  - Document the Roblox.app bundle structure and launch mechanism
- Only then can the Mac platform layer be implemented

### Phase 7: Nexus / WebSocket
- Port WebSocket server for account control
- Port remote command handling

## Critical Details That Must Not Be Lost

These are subtle behaviors in the current codebase. The AI must read and understand the original C# source for each before porting.

### Authentication
- CSRF token uses **lowercase** `x-csrf-token` header (not standard casing)
- Cookie refresh has specific timing to prevent session expiration
- Auth tickets support `launchData` parameter specifically for private server joining
- Multiple REST clients exist for different API subdomains - don't merge them carelessly

### Account Data
- `AccountData.json` has a specific format - the Tauri version MUST be able to read existing files for migration
- Encryption uses libsodium - the Rust equivalent must be compatible (same algorithm, same key derivation)
- Account model has many fields with specific serialization behavior

### Multi-Roblox (Windows)
- Current app kills the Roblox singleton mutex to allow multiple instances
- This involves Windows API calls: OpenMutex, CloseHandle
- Specific mutex name(s) used by Roblox must be preserved

### AccountManager.cs
- This file is ~99KB and contains most UI logic
- It has implicit state management and event handling that isn't obvious from a summary
- Must be read carefully and decomposed into proper components, not just translated

### WebServer
- Local HTTP API server exists for external tool integration
- Endpoints and response formats must stay compatible if possible

### Nexus
- WebSocket server for remote account control
- Command protocol must be documented before porting

## AI Model Instructions

When working on this port:

1. **Always read the original C# source file before porting any feature.** Do not work from summaries alone.
2. **Port one phase at a time.** Get it working, get it reviewed, then move on.
3. **Auth logic is sacred.** Do not simplify, "improve", or refactor auth flows. Port them as-is first, optimize later if needed.
4. **Test with real Roblox API calls** wherever possible during development.
5. **Keep AccountData.json compatibility** - users must be able to migrate without data loss.
6. **The Mac platform layer cannot be coded without research.** Do not guess. Flag it and wait for findings.
7. **UI should be a major upgrade** - modern, dark mode, animations, clean design. This is the main user-facing benefit of the rewrite.
8. **Follow the same code style rules as CLAUDE.md** - no AI-looking code, no AI credit, professional quality.
