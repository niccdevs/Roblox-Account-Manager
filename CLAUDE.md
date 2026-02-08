# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Important Rules for you:**
- always ask before commiting or creating a release
- always use bun instead of node or npm
- if you are adding anything new / redesign anything on the frontend, use the frontend design skill
- always go up from the last release if you release sth (dont overwrite 3.8 to 3.8 but do 3.8.1 for smaller stuff 3.9 for mid range nice feature and 4.0 for very big updates) in readme, release names etc
- dont comment inside the code except if the original author ic3w0lf22 wouldnt have done it either (look at the patterns within a file (comments?))
- never mention AI or give credit to AI anywhere. Code should look very intelligent and professional, but not like ai and definetely not like AI slop
- if theres important not mentioned new knowledge gained, feel free to update this CLAUDE.md, but never eradicate any of the important rules for you section, the rest you can
- create_release, CLAUDE.md, PORTING_STRATEGY.md, PORTING_PLAYBOOK.md, PORTING_LOG.md, the account manager zip file, the .claude folder should NEVER be commited or pushed, NEVER STAGED but also NEVER ADDED TO THE GITIGNORE
- after completing any porting step, you MUST write a detailed entry in PORTING_LOG.md and update the progress table. Read the log first to see what's been done before starting work

- once you're done with sth, restart the account manager. i will never start it

## Project Overview

Roblox Account Manager (RAM) v4 — cross-platform rewrite using Tauri (Rust + TypeScript). Targets Windows and macOS.

The original C# WinForms codebase is in `_legacy/` for reference. Read PORTING_STRATEGY.md and PORTING_PLAYBOOK.md for the full rewrite plan.

## Tech Stack

- **Framework:** Tauri v2
- **Frontend:** TypeScript, React, Vite, Tailwind CSS v4
- **Backend:** Rust
- **Package manager:** Bun (not Node/npm)
- **Target platforms:** Windows 10+, macOS

## Build Commands

```bash
# Dev mode
cargo tauri dev

# Build release
cargo tauri build

# Install frontend dependencies
bun install
```

## Architecture

```
src/                        ← TypeScript frontend (React + Tailwind)
src-tauri/src/
├── main.rs
├── lib.rs                  ← Tauri command registration
├── platform/
│   ├── windows.rs          ← Mutex kill, process management, Roblox launching
│   └── macos.rs            ← Mac equivalent (conditional compilation)
├── api/
│   ├── auth.rs             ← CSRF, cookies, auth tickets
│   └── roblox.rs           ← All Roblox REST API calls
├── data/
│   ├── accounts.rs         ← Account model, JSON load/save
│   ├── settings.rs         ← RAMSettings.ini, RAMTheme.ini
│   └── crypto.rs           ← Encryption (compatible with legacy libsodium)
└── nexus/
    └── websocket.rs        ← Account control WebSocket server

_legacy/                    ← Original C# codebase (read-only reference, never modify)
```

## Legacy Reference

The `_legacy/` folder contains the full original C# codebase. Key files to reference when porting:

- `_legacy/RBX Alt Manager/Classes/Account.cs` — Account model, auth, cookies, tokens
- `_legacy/RBX Alt Manager/Classes/Cryptography.cs` — Encryption
- `_legacy/RBX Alt Manager/Classes/WebServer.cs` — Local HTTP API
- `_legacy/RBX Alt Manager/Classes/RobloxProcess.cs` — Process management, multi-Roblox
- `_legacy/RBX Alt Manager/Classes/Utilities.cs` — Helper methods
- `_legacy/RBX Alt Manager/Classes/IniFile.cs` — Settings parsing
- `_legacy/RBX Alt Manager/AccountManager.cs` — Main form (~99KB, most UI logic)
- `_legacy/RBX Alt Manager/Forms/` — All UI dialogs
- `_legacy/RBX Alt Manager/Nexus/` — Account control system
- `_legacy/RAMAccount.lua` — Nexus Lua script for Roblox clients

## Authentication Flow

This must be ported exactly as-is. No simplification.

1. CSRF token obtained via `/v1/authentication-ticket/` with **lowercase** `x-csrf-token` header
2. `.ROBLOSECURITY` cookie managed per account
3. Automatic cookie refresh prevents session expiration
4. Auth tickets support `launchData` parameter for private servers

## Migration Compatibility

- AccountData.json format must match the legacy format exactly
- Encryption must be compatible with legacy libsodium (decrypt existing files)
- RAMSettings.ini and RAMTheme.ini must load from existing files
- Local web API endpoints must return the same response format

## v4 Release System (GitHub Actions)

- Release workflow: `.github/workflows/release-v4.yml`
- CI workflow: `.github/workflows/ci.yml`
- Label sync workflow: `.github/workflows/sync-release-labels.yml`
- Release helper script: `.github/scripts/prepare-release.mjs`

### How versioning is controlled

- Preferred source is PR labels:
  - `bump:patch` -> increases `4.0.x`
  - `bump:minor` -> increases `4.x.0`
  - `channel:beta` -> prerelease with `-beta.N`
  - `channel:stable` -> stable release
- If commit is a direct push (no PR labels), use commit flags:
  - `[bump:patch]` or `[bump:minor]`
  - `[channel:beta]` or `[channel:stable]`
- If no labels/flags exist, fallback is `patch + beta`

### Release output expectations

- Tag format: `v4.1.0-beta.3`
- Title format: `Roblox Account Manager v4.1.0-beta.3`
- Assets uploaded:
  - NSIS setup `.exe`
  - `.msi`
  - portable `roblox-account-manager.exe`
- Updater channel manifests are split in branch `update-manifests`:
  - `beta/latest.json`
  - `stable/latest.json`

### Required repo configuration

- GitHub Actions workflow permission must be `Read and write`
- Secrets must exist:
  - `TAURI_SIGNING_PRIVATE_KEY`
  - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- If release fails with missing files, make sure these are committed on the target branch:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`

## Correct Commit and Push Process

1. Run `git status --short` and check unstaged/staged files.
2. Stage only explicit files with `git add <path>` (never `git add .`).
3. Never stage or push forbidden files from the Important Rules list.
4. Verify staged content with:
   - `git diff --cached --name-status`
   - `git diff --cached --stat`
5. Ask before committing or releasing.
6. Use clear commit messages with release flags if direct pushing:
   - `fix: ... [bump:patch] [channel:beta]`
   - `feat: ... [bump:minor] [channel:stable]`
7. Push to the intended remote/branch only after staged file verification.
8. Re-check `git status --short` after push to confirm no accidental staging happened.
