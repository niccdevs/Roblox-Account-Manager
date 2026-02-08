# Porting Log

AI models: After completing any step from PORTING_PLAYBOOK.md, write a detailed report here. This is how we track progress and how the next model picks up where you left off.

## How to Write Entries

Each entry must include:
- **Step number and name** from the playbook
- **Date**
- **What was done** - specific files created/modified, crates added, components built
- **What works** - what was tested and confirmed working
- **What doesn't work yet** - known issues, skipped edge cases, TODOs
- **Decisions made** - any choices you made that the next model needs to know about (crate selection, architecture deviations, workarounds)
- **Blockers for next step** - anything that needs to be resolved before continuing

Be specific. File paths, function names, error messages. The next model has zero context from your session.

---

## Progress Overview

| Step | Name | Status | Date |
|------|------|--------|------|
| 0 | Repo Setup | Done | 2026-02-05 |
| 1 | Tauri Scaffold | Done | 2026-02-05 |
| 2 | Account Data Model | Done | 2026-02-05 |
| 3 | Encryption Compat | Done | 2026-02-05 |
| 4 | Settings/Config | Done | 2026-02-05 |
| 5 | Auth (CSRF/Cookies) | Done | 2026-02-05 |
| 6 | Roblox API Clients (Full) | Done | 2026-02-05 |
| 7 | Image & Thumbnail Batch | Done | 2026-02-05 |
| 8 | Frontend - Account List | Done | 2026-02-05 |
| 9 | Frontend - Settings Dialog | Done | 2026-02-05 |
| 10 | Frontend - Server List & Games | Done | 2026-02-06 |
| 11 | Frontend - Account Utility Dialogs | Done | 2026-02-06 |
| 12 | Browser-Based Account Login | Done | 2026-02-06 |
| 13 | Windows Platform (Multi-Roblox, Launching, Watcher) | Done | 2026-02-06 |
| 14 | Local Web Server (Developer API) | Done | 2026-02-06 |
| 15 | Nexus / Account Control | Done | 2026-02-06 |
| 16 | Auto-Updater & App Lifecycle | Done | 2026-02-06 |
| 17 | Polish & Feature Parity Check | In progress | 2026-02-07 |
| 18 | Mac Platform | Blocked (needs research) | - |

---

## Entries

### Step 1: Tauri v2 Project Scaffold
**Date:** 2026-02-05

**What was done:**
Created 25 new files (24 planned + icons), modified `.gitignore`.

Frontend (root + `src/`):
- `package.json` — react 19, vite 6, tailwindcss 4, @tauri-apps/api 2, @tauri-apps/cli 2, bun as package manager
- `index.html` — entry HTML with `<div id="root">`
- `vite.config.ts` — react + @tailwindcss/vite plugins, port 1420, Tauri HMR config
- `tsconfig.json` — ES2020, react-jsx, strict mode
- `tsconfig.node.json` — vite config TS support
- `src/main.tsx` — React 19 createRoot entry
- `src/App.tsx` — minimal dark UI (`bg-zinc-900`, centered "Roblox Account Manager")
- `src/index.css` — `@import "tailwindcss"` (Tailwind v4)
- `src/vite-env.d.ts` — vite type reference

Backend (`src-tauri/`):
- `Cargo.toml` — crate `roblox-account-manager`, lib name `roblox_account_manager_lib`, deps: tauri 2, serde, serde_json
- `build.rs` — `tauri_build::build()`
- `tauri.conf.json` — Tauri v2 config, 1100x700 window, `bun run dev`/`bun run build` commands
- `capabilities/default.json` — `core:default` permissions for main window
- `src/main.rs` — `windows_subsystem = "windows"`, calls `roblox_account_manager_lib::run()`
- `src/lib.rs` — declares `mod platform, api, data, nexus`, `pub fn run()` with `tauri::Builder::default()`
- `src/platform/mod.rs` — `#[cfg(target_os)]` conditional compilation
- `src/platform/windows.rs` — stub: `kill_mutex()`, `launch_roblox()`
- `src/platform/macos.rs` — stub: `launch_roblox()`
- `src/api/mod.rs` — `pub mod auth, roblox`
- `src/api/auth.rs` — stub: `AuthState` struct
- `src/api/roblox.rs` — stub: `RobloxClient` struct
- `src/data/mod.rs` — `pub mod accounts, settings, crypto`
- `src/data/accounts.rs` — stub: `Account` struct with serde derives
- `src/data/settings.rs` — stub: `Settings` struct
- `src/data/crypto.rs` — stub: `Crypto` struct
- `src/nexus/mod.rs` — `pub mod websocket`
- `src/nexus/websocket.rs` — stub: `WebSocketServer` struct
- `icons/` — placeholder .ico and .png files (32x32, 128x128, 128x128@2x, icon.png, icon.ico)

`.gitignore` appended: `target/`, `dist/`, `src-tauri/gen/`, `bun.lock`

**What works:**
- `bun install` installs 85 packages
- `bun run build` produces `dist/index.html` with Vite + Tailwind v4
- `cargo tauri dev` compiles Rust backend (383 crates) and opens the window
- Window title: "Roblox Account Manager", 1100x700
- Dark zinc-900 background with centered white text (Tailwind CSS confirmed working)
- `git status` correctly excludes `target/`, `dist/`, `node_modules/`, `src-tauri/gen/`

**What doesn't work yet:**
- 8 dead_code warnings for stub structs/functions (expected, will resolve as stubs get used)
- Icons are placeholder blue squares (need real icons before release build)

**Decisions made:**
- Lib name `roblox_account_manager_lib` avoids collision with Windows binary name
- No `tauri-plugin-opener` — not needed for scaffold
- Tailwind v4 via `@tailwindcss/vite` plugin (no PostCSS config needed)
- `serde` + `serde_json` included from start since every subsequent step needs them
- Icons required by `tauri-build` even in dev mode — created minimal placeholders via Python
- Vite 6.4.1 installed (v7 available but 6.x is stable with current Tauri tooling)

**Blockers for next step:**
None. Ready for Step 2 (Account Data Model).

### Step 2: Account Data Model
**Date:** 2026-02-05

**What was done:**
Ported the Account model from C# to Rust with full JSON compatibility.

Files modified:
- `src-tauri/Cargo.toml` — added `chrono = { version = "0.4", features = ["serde"] }`
- `src-tauri/src/data/accounts.rs` — full Account struct and AccountStore implementation
- `src-tauri/src/lib.rs` — wired up Tauri commands and AccountStore state
- `src/App.tsx` — updated to display accounts table with IPC calls

**Account struct fields (all from C# Account.cs):**
- `valid` (bool)
- `security_token` (String) — maps to C# `SecurityToken`
- `username` (String)
- `last_use` (DateTime<Utc>) — custom serde module for C# datetime format
- `alias` (String)
- `description` (String)
- `password` (String)
- `group` (String) — default "Default", skipped if default (matches C# NullValueHandling.Ignore)
- `user_id` (i64) — maps to C# `UserID`
- `fields` (HashMap<String, String>) — custom fields dictionary
- `last_attempted_refresh` (DateTime<Utc>)
- `browser_tracker_id` (String)

**NOT ported (JsonIgnore in C#, runtime-only state):**
- `PinUnlocked`, `TokenSet`, `LastAppLaunch`, `CSRFToken`, `Presence`

**Tauri IPC commands created:**
- `get_accounts` — returns all accounts
- `save_accounts` — persists to AccountData.json
- `add_account` — adds new account (updates if user_id exists)
- `remove_account` — removes by user_id
- `update_account` — full account update

**AccountStore implementation:**
- Thread-safe with `Mutex<Vec<Account>>`
- Loads from/saves to `AccountData.json` in same directory as executable
- Handles unencrypted JSON format only (encryption deferred to Step 3)

**What works:**
- Compiles without errors (only dead_code warnings for unused stubs)
- Loads test AccountData.json with 2 accounts successfully
- Frontend displays accounts in a table via `invoke("get_accounts")`
- Serde serialization matches C# JSON format (PascalCase field names)
- DateTime parsing handles multiple formats from C# (with/without milliseconds)
- Group field correctly omitted when "Default" (matches C# behavior)

**Test file created:**
`src-tauri/target/debug/AccountData.json` with 2 test accounts for verification

**What doesn't work yet:**
- Encrypted AccountData.json files (Step 3)
- DPAPI-protected files (Windows-specific, needs Step 3)
- The `NoEncryption.IUnderstandTheRisks.iautamor` bypass file not checked yet
- Account validation against Roblox API (Step 5/6)

**Decisions made:**
- Used `chrono` crate for datetime handling with custom serde module
- Field name serialization uses `#[serde(rename_all = "PascalCase")]` to match C# JSON
- `user_id` as primary key for updates/removes (same as C# logic)
- AccountStore loads on app startup via `lib.rs`
- Errors logged to stderr but don't crash the app

**Blockers for next step:**
None. Ready for Step 3 (Encryption Compatibility).

### Step 3: Encryption Compatibility
**Date:** 2026-02-05

**What was done:**
Ported encryption from C# libsodium (Sodium.Core) to Rust sodiumoxide with byte-for-byte compatibility.

Files modified:
- `src-tauri/Cargo.toml` — added `sodiumoxide = "0.2"`
- `src-tauri/src/data/crypto.rs` — full encryption/decryption implementation
- `src-tauri/src/data/accounts.rs` — integrated crypto, added password management
- `src-tauri/src/lib.rs` — added new commands, initialize sodiumoxide

**Encryption format (matching C# exactly):**
```
[64 bytes] RAMHeader = "Roblox Account Manager created by ic3w0lf22 @ github.com ......."
[16 bytes] Salt (Argon2i salt)
[24 bytes] Nonce (XSalsa20 nonce)
[variable] Ciphertext (XSalsa20-Poly1305 authenticated encryption)
```

**Crypto functions implemented:**
- `hash_password()` — SHA-512 64-byte hash (matches C# `Sodium.CryptoHash.Hash` = `crypto_hash` = SHA-512)
- `derive_key()` — Argon2i with OPSLIMIT_MODERATE (6) / MEMLIMIT_MODERATE (128 MiB), 32-byte key
- `encrypt()` — full encrypt with random salt/nonce
- `decrypt()` — decrypt and verify MAC
- `is_encrypted()` — detect RAMHeader magic bytes
- `init()` — initialize sodiumoxide

**New Tauri IPC commands:**
- `unlock_accounts(password)` — decrypt and load accounts with password
- `is_accounts_encrypted()` — check if file has RAMHeader
- `needs_password()` — check if decryption is needed
- `set_encryption_password(password)` — set/remove encryption, re-save

**AccountStore changes:**
- Added `password_hash: Mutex<Option<Vec<u8>>>` for storing hashed password
- `load()` now detects encrypted files and requires password
- `load_with_password()` hashes password and decrypts
- `save()` encrypts if password is set, plaintext otherwise

**Algorithm mapping (C# → Rust):**
| C# (Sodium.Core) | Rust (sodiumoxide) |
|------------------|-------------------|
| `CryptoHash.Hash` | `hash::sha512::hash` (SHA-512) |
| `PasswordHash.ArgonHashBinary` | `pwhash::argon2i13::derive_key` |
| `PasswordHash.StrengthArgon.Moderate` | `OPSLIMIT_MODERATE + MEMLIMIT_MODERATE` |
| `SecretBox.Create` | `secretbox::seal` (XSalsa20-Poly1305) |
| `SecretBox.Open` | `secretbox::open` |

**What works:**
- Compiles without errors
- Detects encrypted files by RAMHeader
- Unencrypted files load as before
- New IPC commands registered

**What doesn't work yet / needs verification:**
- **Needs real encrypted AccountData.json from legacy app to verify decryption**
- Windows DPAPI-protected files not supported (different from password encryption)
- `NoEncryption.IUnderstandTheRisks.iautamor` bypass not implemented yet

**Step 3 bugfix (2026-02-05):**
Fixed 3 critical bugs that prevented decryption of legacy encrypted files:

1. **Wrong hash function**: Was using `generichash::hash` (Blake2b-512) for password hashing, but C#'s `Sodium.CryptoHash.Hash()` wraps `crypto_hash()` which is **SHA-512**. Fixed to `sha512::hash`.
2. **Wrong Argon2 variant**: Was using Argon2id (via separate `argon2` crate), but the legacy app bundles libsodium pre-1.0.15 which only has **Argon2i** (no argon2id exports in the DLL at all). `crypto_pwhash_ALG_DEFAULT` = Argon2i in that version. Fixed to `pwhash::argon2i13`.
3. **Wrong Argon2 parameters** (first attempt only): Original buggy code used m=128MiB, t=6 which happens to be correct for Argon2i MODERATE, but was paired with Blake2b hash so it still failed. Intermediate fix incorrectly switched to Argon2id params (m=256MiB, t=3). Final fix: Argon2i with sodiumoxide's `OPSLIMIT_MODERATE` (6) / `MEMLIMIT_MODERATE` (128 MiB).

Key discovery: `_legacy/packages/libsodium-net.0.10.0/output/libsodium-64.dll` exports only `crypto_pwhash_argon2i*` functions — no `crypto_pwhash_argon2id*` at all. This confirms the bundled libsodium is pre-1.0.15.

Also removed `blake2` and `argon2` crate dependencies — sodiumoxide wraps the same libsodium C library and has all needed functions built in. Removed debug prints, brute_force_params, and hardcoded test password from lib.rs.

**Verified working:** Successfully decrypted real encrypted AccountData.json from the legacy C# app with user's password. Accounts loaded and displayed correctly.

**Decisions made:**
- Used `sodiumoxide 0.2` crate (stable Rust wrapper for libsodium)
- Password hash stored in memory only (not persisted to disk)
- App startup skips loading if encrypted file detected (waits for `unlock_accounts`)
- Same encryption format as C# — files encrypted by v4 can be read by legacy app and vice versa
- All crypto functions use sodiumoxide exclusively (no mixing of crates)
- Argon2i (not Argon2id) to match legacy libsodium version

**Blockers for next step:**
None. Encryption verified working with real data.
Ready for Step 4 (Settings/Config).

### Step 4: Settings and Config
**Date:** 2026-02-05

**What was done:**
Ported INI file parsing and settings/theme management from C# to Rust.

Files modified:
- `src-tauri/src/data/settings.rs` — full implementation (IniFile parser, SettingsStore, ThemeStore, Tauri commands)
- `src-tauri/src/lib.rs` — wired up SettingsStore and ThemeStore as Tauri managed state, registered 5 new commands
- `src/App.tsx` — added verification UI (collapsible settings/theme display)

**Implementation:**

`IniFile` — custom INI parser matching C# IniFile.cs behavior:
- Section headers in `[brackets]`, key=value pairs, `#`/`;` comment lines
- `[RBX Alt Manager]` auto-renamed to `[Roblox Account Manager]` (legacy theme compat)
- Empty/whitespace values remove the property (matches C# `Set()` behavior)
- Preserves comments on save

`SettingsStore` — wraps IniFile for RAMSettings.ini:
- Thread-safe with `Mutex<IniFile>`
- Applies defaults on construction (only for missing keys, preserves existing values)
- 6 sections: General, Developer, WebServer, AccountControl, Watcher, Prompts
- All defaults match C# AccountManager.cs lines 125-152 exactly

`ThemeStore` — wraps IniFile for RAMTheme.ini:
- Loads all theme properties from `[Roblox Account Manager]` section
- Case-insensitive boolean parsing (C# writes `True`/`False`, not `true`/`false`)
- Catppuccin-style defaults for fresh installations
- INI key names match C# exactly: AccountsBG, AccountsFG, ButtonsBG, ButtonsFG, ButtonsBC, FormsBG, FormsFG, TextBoxesBG, TextBoxesFG, TextBoxesBC, LabelsBC, LabelsFC, LabelsTransparent, DarkTopBar, ShowHeaders, LightImages, ButtonStyle

**Tauri IPC commands:**
- `get_all_settings()` — returns all sections as nested HashMap
- `get_setting(section, key)` — get a specific setting value
- `update_setting(section, key, value)` — update and save
- `get_theme()` — return ThemeData struct
- `update_theme(theme)` — replace theme and save

**What works:**
- Real RAMSettings.ini from legacy app loads with all 6 sections and all keys preserved
- Real RAMTheme.ini from legacy app loads with correct colors and boolean flags
- Frontend displays loaded settings and theme colors via IPC
- Settings and theme accessible from frontend via invoke()

**What doesn't work yet:**
- No settings editing UI (comes in Step 8: Frontend Dialogs)
- Windows registry startup key not ported (Windows-specific, may defer)
- `CustomClientSettings` file copy logic not ported

**Decisions made:**
- Custom INI parser instead of external crate — matches C# behavior exactly (section rename, empty-value removal, comment preservation)
- No new crate dependencies added
- ThemeData uses snake_case field names in Rust/JSON (frontend will map to CSS variables)
- Typed getters (get_bool, get_int, get_float) on IniSection for future internal Rust use

**Blockers for next step:**
None. Ready for Step 5 (Auth: CSRF/Cookies).

### Step 5: Authentication (CSRF/Cookies)
**Date:** 2026-02-05

**What was done:**
Ported the full authentication layer from C# (Account.cs + AccountManager.cs REST clients) to Rust using reqwest.

Files modified:
- `src-tauri/Cargo.toml` — added `reqwest` (0.12, cookies+json), `tokio` (1, full), `urlencoding` (2)
- `src-tauri/src/api/auth.rs` — full auth implementation
- `src-tauri/src/api/roblox.rs` — user lookup, user info, robux, email API calls
- `src-tauri/src/lib.rs` — 10 new Tauri commands, helper to look up account cookies
- `src/App.tsx` — added per-account Test button for auth verification

**Auth functions ported (auth.rs):**
- `validate_cookie(cookie)` → GET `www.roblox.com/my/account/json` — returns AccountInfo (UserId, Name, etc.)
- `get_csrf_token(cookie)` → POST `auth.roblox.com/v1/authentication-ticket/` — expects 403, reads `x-csrf-token` header
- `get_auth_ticket(cookie)` → gets CSRF first, then POST same endpoint with `x-csrf-token` + `Referer` + empty JSON body → reads `rbx-authentication-ticket` header
- `check_pin(cookie)` → GET `auth.roblox.com/v1/account/pin/` — checks if pin is enabled/unlocked
- `unlock_pin(cookie, pin)` → POST `auth.roblox.com/v1/account/pin/unlock` with CSRF + form body
- `log_out_other_sessions(cookie)` → POST `www.roblox.com/authentication/signoutfromallsessionsandreauthenticate` — extracts new `.ROBLOSECURITY` from `set-cookie` header
- `change_password(cookie, current, new)` → POST `auth.roblox.com/v2/user/passwords/change` — returns new cookie
- `change_email(cookie, password, email)` → POST `accountsettings.roblox.com/v1/email`
- `set_display_name(cookie, user_id, name)` → PATCH `users.roblox.com/v1/users/{id}/display-names`

**API functions ported (roblox.rs):**
- `get_user_id(cookie, username)` → POST `users.roblox.com/v1/usernames/users`
- `get_user_info(cookie, user_id)` → GET `users.roblox.com/v1/users/{id}`
- `get_robux(cookie)` → GET `www.roblox.com/mobileapi/userinfo`
- `get_email_info(cookie)` → GET `accountsettings.roblox.com/v1/email`

**REST client base URLs (matching C# exactly):**
| C# Client | Base URL |
|-----------|----------|
| MainClient | `https://www.roblox.com/` |
| AuthClient | `https://auth.roblox.com/` |
| AccountClient | `https://accountsettings.roblox.com/` |
| UsersClient | `https://users.roblox.com` |
| FriendsClient | `https://friends.roblox.com` |
| AvatarClient | `https://avatar.roblox.com/` |
| EconClient | `https://economy.roblox.com/` |
| GameJoinClient | `https://gamejoin.roblox.com/` (UA: Roblox/WinInet) |
| Web13Client | `https://web.roblox.com/` |

**Tauri IPC commands:**
- `test_auth(cookie)` — runs validate + CSRF + ticket, returns combined results
- `validate_cookie(cookie)` — validate raw cookie
- `get_csrf_token(user_id)` — get CSRF for stored account
- `get_auth_ticket(user_id)` — get auth ticket for stored account
- `check_pin(user_id)` / `unlock_pin(user_id, pin)`
- `refresh_cookie(user_id)` — log out other sessions, updates stored cookie if new one returned
- `get_robux(user_id)` / `get_user_info(user_id)` / `lookup_user(username)`

**Key implementation details:**
- `reqwest::redirect::Policy::none()` — disabled redirects so we can read 403 response headers for CSRF
- Cookie sent as raw `Cookie: .ROBLOSECURITY=...` header (not reqwest cookie jar) — matches C# RestSharp per-request cookie behavior
- `Referer: https://www.roblox.com/games/2753915549/Blox-Fruits` header on auth requests (matches C# exactly)
- Auth ticket request sends empty JSON body with `Content-Type: application/json` (matches C# `.AddJsonBody(string.Empty)`)
- Cookie refresh extracts new `.ROBLOSECURITY` from `set-cookie` response header and updates AccountStore

**Verified working:**
- CSRF token obtained successfully from real account
- Auth ticket generated successfully from real account
- Frontend Test button shows ticket preview per-account

**What's NOT ported yet (deferred to later steps):**
- `JoinServer` / Roblox launch flow (Step 9: Windows Multi-Roblox)
- `SetServer` / GameJoin API (Step 6: Roblox API Clients)
- Avatar operations, friend requests, block/unblock (Step 6)
- Quick Login (Step 6)
- Private server link code parsing (Step 9)
- Auto cookie refresh timer (Step 7: Frontend, will use Tauri interval)

**Decisions made:**
- Functions take raw cookie string, not account reference — cleaner for Tauri command layer
- Tauri commands look up cookie from AccountStore by user_id — keeps auth functions pure/testable
- No global HTTP client state — each request builds a fresh client (simple, no connection pool management needed at this scale)
- Used reqwest instead of Tauri HTTP plugin — gives full control over headers, redirects, cookie handling

**Blockers for next step:**
None. Ready for Step 6 (Roblox API Clients).

### Step 6: Roblox API Clients (Full)
**Date:** 2026-02-05

**What was done:**
Ported ALL Roblox API endpoints from the legacy C# codebase to Rust. Every HTTP call from Account.cs, AccountManager.cs, ServerList.cs, Batch.cs, Presence.cs, and MissingAssetControl.cs has been cataloged and implemented.

Files modified:
- `src-tauri/src/api/roblox.rs` — expanded from 132 lines to 1003 lines with all API functions
- `src-tauri/src/api/auth.rs` — added Quick Login (enterCode + validateCode)
- `src-tauri/src/lib.rs` — 27 new Tauri IPC commands (total now ~50 commands)

**API functions implemented by category:**

Users (existing from Step 5, unchanged):
- `get_user_id` — POST users.roblox.com/v1/usernames/users
- `get_user_info` — GET users.roblox.com/v1/users/{id}
- `get_robux` — GET www.roblox.com/mobileapi/userinfo
- `get_email_info` — GET accountsettings.roblox.com/v1/email

Friends:
- `send_friend_request` — POST friends.roblox.com/v1/users/{id}/request-friendship

Blocking:
- `block_user` — POST accountsettings.roblox.com/v1/users/{id}/block
- `unblock_user` — POST accountsettings.roblox.com/v1/users/{id}/unblock
- `get_blocked_users` — GET accountsettings.roblox.com/v1/users/get-detailed-blocked-users
- `unblock_all_users` — loops through blocked list, unblocks each

Privacy:
- `set_follow_privacy` — POST www.roblox.com/account/settings/follow-me-privacy (values: All, Followers, Following, Friends, NoOne)
- `get_private_server_invite_privacy` — GET www.roblox.com/account/settings/private-server-invite-privacy
- `set_private_server_invite_privacy` — POST www.roblox.com/account/settings/private-server-invite-privacy

Avatar:
- `set_avatar` — sequential calls: set-player-avatar-type, set-scales, set-body-colors, set-wearing-assets (matches C# SetAvatar exactly, handles "scales" or "scale" key, returns invalidAssetIds)
- `get_outfits` — GET avatar.roblox.com/v1/users/{id}/outfits (public, no auth)
- `get_outfit_details` — GET avatar.roblox.com/v1/outfits/{id}/details (public, no auth)

Games & Servers:
- `get_place_details` — GET games.roblox.com/v1/games/multiget-place-details (batches 50 per request)
- `get_servers` — GET games.roblox.com/v1/games/{id}/servers/{type} (public: limit=100, VIP: limit=25 with Accept header, pagination via cursor)
- `join_game_instance` — POST gamejoin.roblox.com/v1/join-game-instance (User-Agent: Roblox/WinInet, supports isTeleport flag)
- `join_game` — POST gamejoin.roblox.com/v1/join-game
- `search_games` — GET games.roblox.com/v1/games/list (no keyword) or GET www.roblox.com/games/list-json (with keyword)
- `get_universe_places` — GET develop.roblox.com/v1/universes/{id}/places (recursive pagination)
- `parse_private_server_link_code` — GET www.roblox.com/games/{id}?privateServerLinkCode={code}, parses HTML for Roblox.GameLauncher.joinPrivateGame() access code, falls back to web.roblox.com (fixed bug from legacy: C# used wrong response variable in fallback)

Groups:
- `join_group` — POST groups.roblox.com/v1/groups/{id}/users

Presence:
- `get_presence` — POST presence.roblox.com/v1/presence/users (no auth required)

Quick Login (auth.rs):
- `quick_login_enter_code` — POST apis.roblox.com/auth-token-service/v1/login/enterCode (returns deviceInfo, location)
- `quick_login_validate_code` — POST apis.roblox.com/auth-token-service/v1/login/validateCode

Thumbnails:
- `batch_thumbnails` — POST thumbnails.roblox.com/v1/batch (batches 100 per request, supports all types: Avatar, AvatarHeadShot, GameIcon, Asset, etc.)
- `get_avatar_headshots` — GET thumbnails.roblox.com/v1/users/avatar-headshot (no auth)
- `get_asset_thumbnails` — GET thumbnails.roblox.com/v1/assets (optional auth, uses PlaceHolder returnPolicy)

Economy:
- `get_asset_details` — GET economy.roblox.com/v2/assets/{id}/details (optional auth)
- `purchase_product` — POST economy.roblox.com/v1/purchases/products/{id} (expectedCurrency=1 for Robux)

**Tauri IPC commands added (27 new):**
send_friend_request, block_user, unblock_user, get_blocked_users, unblock_all_users,
set_follow_privacy, get_private_server_invite_privacy, set_private_server_invite_privacy,
set_avatar, get_outfits, get_outfit_details,
get_place_details, get_servers, join_game_instance, join_game, search_games, get_universe_places, parse_private_server_link_code,
join_group, get_presence, batch_thumbnails, get_avatar_headshots, get_asset_thumbnails,
get_asset_details, purchase_product, quick_login_enter_code, quick_login_validate_code

**Command parameter patterns:**
- Required auth: `(state, user_id, ...)` — looks up cookie from AccountStore
- Optional auth: `(state, ..., user_id: Option<i64>)` — uses cookie if user_id provided
- No auth: `(...)` — no state or user_id needed

**Helper functions added to roblox.rs:**
- `game_join_client()` — reqwest client with User-Agent "Roblox/WinInet" (matches C# GameJoinClient)
- `no_redirect_client()` — reqwest client with redirect policy disabled (for private server link parsing)
- `extract_access_code(html)` — parses Roblox.GameLauncher.joinPrivateGame() from HTML to extract UUID access code

**Subdomain separation preserved (matching C# exactly):**
| Rust function | C# Client | Subdomain |
|---|---|---|
| send_friend_request | FriendsClient | friends.roblox.com |
| block/unblock/blocked | AccountClient | accountsettings.roblox.com |
| privacy settings | MainClient | www.roblox.com |
| avatar operations | AvatarClient | avatar.roblox.com |
| servers/places/search | GamesClient | games.roblox.com |
| join game | GameJoinClient | gamejoin.roblox.com |
| universe places | DevelopClient | develop.roblox.com |
| presence | PresenceClient | presence.roblox.com |
| thumbnails | ThumbnailAPI | thumbnails.roblox.com |
| economy | EconClient | economy.roblox.com |
| quick login | API (custom) | apis.roblox.com |

**What works:**
- Compiles without errors (only dead_code warnings for stubs in other modules)
- No new crate dependencies needed — reqwest, tokio, serde_json, urlencoding already present

**What doesn't work yet / deferred:**
- Actual Roblox launch flow (building protocol URL, calling RobloxPlayerBeta.exe) — Step 13
- Auto cookie refresh timer — Step 8 frontend
- IP geolocation for server regions (uses external API configured via IPApiLink setting) — can add in Step 10
- Unblock all with retry logic (C# retries on failure) — current implementation continues on failure

**Bug fix vs legacy:**
- `parse_private_server_link_code`: C# had a bug where the web.roblox.com fallback parsed `response` (from www.roblox.com) instead of `result` (from web.roblox.com). Rust implementation correctly uses the fallback response body.

**Decisions made:**
- API functions take raw cookie strings, Tauri commands do the AccountStore lookup — keeps API layer pure
- `get_outfits` and `get_outfit_details` are public endpoints (no auth) matching C# behavior
- `search_games` is unauthenticated matching C# behavior (C# uses `new RestRequest`, not `MakeRequest`)
- `get_servers` returns one page at a time with cursor — caller handles pagination (matches C# UI pattern)
- `get_universe_places` fetches all pages internally — universe place counts are typically small
- `get_place_details` batches 50 per request matching C# `DoPlaceRequest` behavior
- `batch_thumbnails` batches 100 per request matching C# `DoBatchRequest` behavior
- Private server access code extracted via string operations (no regex crate needed)

**Blockers for next step:**
None. Ready for Step 7 (Image & Thumbnail Batch).

### Step 7: Image & Thumbnail Batch System
**Date:** 2026-02-05

**What was done:**
Ported the C# Batch.cs thumbnail coalescing system to Rust with 50ms batching window, caching, and game icon resolution.

Files created:
- `src-tauri/src/api/batch.rs` — full ImageCache implementation (~300 lines)

Files modified:
- `src-tauri/src/api/mod.rs` — registered `batch` module
- `src-tauri/src/lib.rs` — 5 new Tauri commands, ImageCache managed state
- `src/App.tsx` — added BatchTests component for Step 7 verification

**Also fixed during this session (Step 6 regressions):**

Roblox endpoint migrations (4 endpoints returning 404/403):
- `get_robux` — migrated from `www.roblox.com/mobileapi/userinfo` (dead) to `economy.roblox.com/v1/user/currency` as primary, with mobileapi as fallback
- `block_user`/`unblock_user` — migrated from `accountsettings.roblox.com/v1/users/{id}/block|unblock` to `apis.roblox.com/user-blocking-api/v1/users/{id}/block-user|unblock-user`
- `get_blocked_users` — migrated from `accountsettings.roblox.com/v1/users/get-detailed-blocked-users` to `apis.roblox.com/user-blocking-api/v1/users/get-blocked-users` + user info hydration via `users.roblox.com/v1/users`
- `search_games` — migrated from `games.roblox.com/v1/games/list` and `www.roblox.com/games/list-json` to `apis.roblox.com/search-api/omni-search` (keyword search) and `apis.roblox.com/discovery-api/omni-recommendation` (popular games browse)
- `get/set_private_server_invite_privacy` — migrated from `www.roblox.com/account/settings/private-server-invite-privacy` to `accountsettings.roblox.com/v1/privacy` (GET + PATCH)

3 remaining known issues (deferred):
- `search_games` (401) — omni-search/discovery APIs require auth cookie, currently called without auth
- `get_blocked_users` (403) — new endpoint returns "Request Context BrowserTrackerID is missing or invalid"
- `get_private_server_invite_privacy` (404) — accountsettings.roblox.com/v1/privacy endpoint doesn't include privateServerInvitePrivacy field, may be fully removed by Roblox

**ImageCache architecture (batch.rs):**

Core design — 50ms coalescing window with oneshot channels (matching C# Batch.cs):
1. Callers call `get_image()` or `get_images_batch()` which adds requests to a shared queue
2. First request spawns a background tokio task that sleeps 50ms (the batching window)
3. During those 50ms, all concurrent callers add their requests to the same queue
4. After 50ms, the background task drains the queue, deduplicates by (targetId, type, size), and fires POST to thumbnails.roblox.com/v1/batch (max 100 per request)
5. Results are dispatched to individual callers via oneshot channels
6. Results are cached in a HashMap keyed by `"targetId:type:size"`

Structs:
- `ImageCache` — main state, managed by Tauri. Contains: thumbnail_queue, place_queue, cache (HashMap), place_universe_cache (HashMap), batch_active flag, place_batch_active flag
- `PendingRequest` — queued thumbnail request with oneshot::Sender for response
- `CachedThumbnail` — serializable result returned to frontend

Public methods:
- `get_image(target_id, type, size, format)` → queues single request, returns cached or awaits batch
- `get_images_batch(requests)` → queues all requests at once, fires one batch, returns all results (used for bulk headshots)
- `get_game_icon(place_id, cookie)` → resolves PlaceId→UniverseId via multiget-place-details, then fetches GameIcon via batch. Falls back to /v1/assets if universe lookup fails
- `get_cached_url(target_id, type, size)` → cache lookup without triggering batch
- `clear_cache()` → clears both image URL cache and PlaceId→UniverseId cache

Private methods:
- `ensure_batch_running()` → spawns background task if not already active
- `resolve_place_to_universe(place_id, cookie)` → calls games.roblox.com/v1/games/multiget-place-details, caches result
- `get_asset_image_fallback(asset_id, cookie)` → individual /v1/assets request as last resort

**Tauri IPC commands (5 new):**
- `batched_get_image(target_id, thumbnail_type, size, format)` → single batched image request
- `batched_get_avatar_headshots(user_ids, size)` → bulk headshot request (all queued at once for single batch)
- `batched_get_game_icon(place_id, user_id?)` → game icon with PlaceId→UniverseId resolution
- `get_cached_thumbnail(target_id, thumbnail_type, size)` → cache-only lookup
- `clear_image_cache()` → clear all caches

**What works:**
- All 6 batch tests pass:
  - Single batched image request returns URL
  - Bulk headshots (8 users) all return URLs in single batch
  - Second request for same users is instant from cache
  - Game icon resolution (PlaceId→UniverseId→GameIcon) works
  - Cache lookup confirms entries are stored
  - Cache clear removes all entries
- Compiles with only dead_code warnings (for unused place_queue/PendingPlaceRequest — reserved for future place batch optimization)

**What doesn't work yet / deferred:**
- Place details batch coalescing (place_queue exists but isn't wired up — each game icon resolution does individual HTTP call currently. Can optimize later if needed)
- Token-based headshots (player tokens from server data, used in ServerList player search) — not ported, will add in Step 10
- No TTL/eviction on cache — entries persist until clear_image_cache() is called or app restarts

**Decisions made:**
- Used `tokio::sync::Mutex` + `oneshot::channel` pattern instead of C#'s Task.ContinueWith — more idiomatic Rust async
- `get_images_batch()` queues all requests before triggering the batch task — ensures they all land in the same 50ms window
- Session IDs for search_games generated from system time (no rand crate dependency)
- No new crate dependencies — uses existing tokio, reqwest, serde
- ImageCache is Tauri managed state (same as AccountStore, SettingsStore) — thread-safe via Arc<Mutex>

**Blockers for next step:**
None. Ready for Step 8 (Frontend - Main Account List).

### Step 8: Frontend — Main Account List
**Date:** 2026-02-05

**What was done:**
Complete rewrite of the frontend from a test/debug UI to a production-grade main application interface using React + Tailwind CSS v4.

**Files created (7 new):**
- `src/types.ts` — Account, ThemeData, ParsedGroup interfaces + helper functions (parseGroupName, timeAgo, getFreshnessColor)
- `src/store.tsx` — Global state management via React Context (StoreProvider + useStore hook)
- `src/components/PasswordScreen.tsx` — Password unlock screen with lock icon, error display
- `src/components/Toolbar.tsx` — Top bar: search/filter input, hide usernames toggle, sidebar toggle, Add Account dropdown (Import Cookie, Import User:Pass), Settings button
- `src/components/AccountList.tsx` — Grouped account list with avatars, freshness dots, selection, drag-drop, empty states
- `src/components/ContextMenu.tsx` — Full right-click context menu with 20+ items and submenus
- `src/components/DetailSidebar.tsx` — Right panel: account info, alias/description editing, launch controls (PlaceId/JobId/LaunchData), shuffle toggle, save-to-account, Join Server, Follow, tool buttons
- `src/components/StatusBar.tsx` — Bottom bar: selected count, total count, auto-refresh indicator

**Files modified (2):**
- `src/App.tsx` — Complete rewrite: StoreProvider wrapper, conditional password/main UI, error banner, toast notifications, modal overlay
- `src/index.css` — Added Google Fonts (Outfit + JetBrains Mono), Tailwind v4 @theme font tokens, custom scrollbar styling, animations (fade-in, slide-right), sidebar component CSS classes (sidebar-input, sidebar-btn, sidebar-btn-sm, sidebar-btn-tool), context menu submenu hover behavior

**Architecture:**
```
src/
├── types.ts          — Shared interfaces & utility functions
├── store.tsx         — React Context state management (single provider)
├── App.tsx           — Root: StoreProvider → AppContent (password gate + layout)
├── index.css         — Tailwind v4 + custom styles
├── main.tsx          — Entry point (unchanged)
├── components/
│   ├── PasswordScreen.tsx
│   ├── Toolbar.tsx
│   ├── AccountList.tsx
│   ├── ContextMenu.tsx
│   ├── DetailSidebar.tsx
│   └── StatusBar.tsx
```

**State management (store.tsx):**
Single React Context providing:
- Account CRUD (load, save, add by cookie, remove, update)
- Selection (single click, Ctrl+click multi, Shift+click range, selectAll, deselectAll, selectSingle)
- Search/filter (case-insensitive across username, alias, description, group)
- Group management (collapsible headers, numeric prefix sorting, move-to-group)
- Launch inputs (placeId, jobId, launchData, shuffleJobId)
- Context menu positioning
- Sidebar toggle
- Settings & theme (loaded from Tauri on init)
- Avatar URL cache (batched via batched_get_avatar_headshots)
- Auto cookie refresh (5-minute interval matching legacy behavior)
- Toast notifications + modal overlay system
- Error state + password unlock flow

**Account list features:**
- Groups with collapsible headers (chevron icon, group name, account count)
- Numeric prefix sorting (e.g. "1Main" sorts before "2Alts", number hidden in display)
- Account rows: avatar headshot (32x32, rounded), display name (alias or username), @username subtitle, description, relative time ("2d", "5h", "now")
- Freshness indicator: colored dot (none for <20 days, yellow→red gradient for 20-30+ days, matching legacy thresholds exactly)
- Selection: single click, Ctrl+click toggle, Shift+click range
- React.memo on AccountRow for performance
- Drag-to-group-header to move accounts between groups
- External cookie drop (regex matches .ROBLOSECURITY format, auto-adds account)
- Empty state with "No accounts yet" message and drop hint
- Search empty state with "No matches" message

**Context menu items (all from legacy):**
- Set Alias, Set Description
- Copy submenu: Cookie, Username, Password, User:Pass, User ID, Profile Link
- Dev mode only: Copy rbx-player Link, Copy App Link, Get Auth Ticket, View/Edit Fields
- Remove Account (with confirmation)
- Move to Group submenu (all existing groups + "New Group...")
- Copy Group, Sort Alphabetically, Toggle Groups
- Show Details (JSON modal), Quick Login (6-digit code, reads clipboard first)

**Detail sidebar features:**
- Account header: avatar (48x48), display name, @username, User ID
- Robux balance (fetched on selection via get_robux)
- Valid/Invalid status indicator
- Alias input + Set button (30 char max, Enter key support)
- Description textarea + Set Description button
- Launch section: Place ID, Job ID (with shuffle toggle), Launch Data (with save-to-account button)
- Join Server button (supports multi-account with AccountJoinDelay)
- Follow section: username input + Follow button (with presence check)
- Tools grid: Server List, Utilities, Nexus, Browser, Theme, Refresh Cookie
- Multi-select mode: batch Join All + Remove All buttons

**Auto cookie refresh (matching legacy exactly):**
- 5-minute interval via setInterval
- Skips accounts with NoCookieRefresh field set to "true"
- Skips if LastUse < 20 days
- Skips if LastAttemptedRefresh < 7 days
- Calls refresh_cookie Tauri command
- 5-second delay between accounts

**Design:**
- Dark theme: zinc-950 base, zinc-900 surfaces, zinc-800 borders
- Accent: sky-500/sky-600 for interactive elements
- Typography: Outfit (Google Fonts) for UI, JetBrains Mono for IDs/monospace
- Thin custom scrollbars (6px, zinc-700 thumb)
- Animations: fade-in (150ms) for menus/toasts, slide-right (200ms) for sidebar
- Backdrop blur on context menu (glass-morphism effect)
- Selection highlight: sky-500/8% background + 2px left border

**Tauri commands wired up:**
- needs_password, unlock_accounts — password flow
- get_accounts, save_accounts, add_account, remove_account, update_account — account CRUD
- validate_cookie — for Import Cookie flow
- get_all_settings, get_theme — settings/theme on init
- batched_get_avatar_headshots — avatar loading
- get_robux — sidebar balance display
- refresh_cookie — manual + auto refresh
- join_game, join_game_instance — Join Server button
- lookup_user, get_presence — Follow button
- get_auth_ticket — context menu (dev mode)
- quick_login_enter_code — Quick Login context menu item
- navigator.clipboard.writeText — all Copy operations

**What works:**
- TypeScript compiles with zero errors (bunx tsc --noEmit)
- Vite production build succeeds (231KB JS, 25KB CSS)
- Tauri dev mode launches app with password screen for encrypted accounts
- All UI components render correctly
- Store provider initializes and loads settings/theme/accounts

**What doesn't work yet / deferred:**
- Server List dialog (Step 10)
- Account Utilities dialog (Step 11)
- Settings dialog (Step 9)
- Theme Editor dialog (Step 9)
- Account Control / Nexus dialog (Step 15)
- Browser-based login (Step 12)
- Within-group drag reorder (drag-to-group works, within-group reorder deferred)
- Recent Games dropdown (needs RecentGames.json persistence)
- Presence dots on account rows (get_presence polling not wired to list yet)
- Place name lookup debounce (PlaceTimer from legacy)
- search_games integration in Recent Games
- Buttons that show "coming soon" toast: Settings, Server List, Utilities, Nexus, Browser, Theme

**Decisions made:**
- Single React Context for all state (simpler than multiple contexts or external state lib)
- No additional npm dependencies — pure React + Tailwind + Tauri API
- Google Fonts for typography (cached by webview, can bundle later for offline)
- window.prompt/confirm for simple dialogs (functional, can replace with custom modals later)
- Sidebar is collapsible (defaults open) — context menu provides alternative access to all actions
- PlaceId/JobId inputs in sidebar (not toolbar) — keeps toolbar clean, groups launch controls with account actions
- React.memo on AccountRow to prevent unnecessary re-renders with large account lists
- CSS-only submenu hover (no JavaScript timers) via .submenu-trigger:hover pattern

**Blockers for next step:**
None. Ready for Step 9 (Frontend - Settings Dialog).

### Step 9: Frontend — Settings Dialog
**Date:** 2026-02-05

**What was done:**
Built the Settings dialog as a full modal overlay with 5 tabs matching all settings from the legacy C# SettingsForm + Watcher settings from ServerList.

**Files created (1):**
- `src/components/SettingsDialog.tsx` — complete settings dialog with 5 tabs, custom hooks, auto-save

**Files modified (3):**
- `src/App.tsx` — imported and rendered SettingsDialog, wired to store state
- `src/store.tsx` — added `settingsOpen`, `setSettingsOpen`, `reloadSettings` to StoreValue interface and provider
- `src/components/Toolbar.tsx` — changed Settings gear button from "coming soon" toast to opening the dialog

**Settings Dialog architecture:**

Custom `useSettings` hook:
- `load()` — fetches all settings via `get_all_settings` IPC
- `get(section, key, fallback)` — read a string value
- `getBool(section, key)` — read a boolean ("true"/"false")
- `getNumber(section, key, fallback)` — read a numeric value
- `set(section, key, value)` — optimistic local update + debounced (150ms) `update_setting` IPC
- `setBool`, `setNumber` — typed wrappers
- `saving` flag for "saving..." indicator
- All changes auto-save to RAMSettings.ini via the Tauri backend

Reusable form components (internal to SettingsDialog):
- `Toggle` — custom slide toggle with label + optional description
- `NumberField` — labeled number input with min/max/step/suffix
- `TextField` — labeled text input with optional regex pattern filter
- `Divider`, `SectionLabel` — visual organization
- `WarningBadge`, `RestartBadge` — inline status indicators

**5 tabs implemented:**

General tab (section: General):
- CheckForUpdates (bool)
- AsyncJoin (bool) — "Async Launching"
- AccountJoinDelay (number, 0-60, step 0.5, suffix "sec")
- SavePasswords (bool)
- DisableAgingAlert (bool)
- HideRbxAlert (bool) — "Hide Multi Roblox Alert"
- DisableImages (bool)
- ShuffleChoosesLowestServer (bool)
- EnableMultiRbx (bool) — with "use at own risk" warning badge
- ShowPresence (bool)
- AutoCookieRefresh (bool)
- StartOnPCStartup (bool) — "Run on Windows Startup"
- MaxRecentGames (number, 1-30)
- ServerRegionFormat (text)

Developer tab (section: Developer):
- DevMode (bool) — "Enable Developer Mode"
- EnableWebServer (bool) — with "restart required" badge

WebServer tab (section: WebServer):
- Only visible when DevMode or EnableWebServer is true
- Shows empty state message otherwise
- EveryRequestRequiresPassword (bool)
- AllowGetCookie (bool)
- AllowGetAccounts (bool)
- AllowLaunchAccount (bool)
- AllowAccountEditing (bool)
- AllowExternalConnections (bool) — with "restart required" badge
- Password (text, alphanumeric pattern filter matching legacy regex)
- WebServerPort (number, 1-65535)

Watcher tab (section: Watcher):
- ExitIfNoConnection (bool)
- NoConnectionTimeout (number, 5-600, suffix "sec")
- ExitOnBeta (bool)
- VerifyDataModel (bool) — "Data Model Verification"
- IgnoreExistingProcesses (bool)
- CloseRbxMemory (bool) — "Close If Memory Low"
- MemoryLowValue (number, 50-2048, suffix "MB")
- CloseRbxWindowTitle (bool) — "Close If Window Title Mismatch"
- ExpectedWindowTitle (text)
- SaveWindowPositions (bool) — "Remember Window Positions"

Miscellaneous tab (section: General):
- UnlockFPS (bool)
- MaxFPSValue (number, 5-9999)
- ShuffleJobId (bool)
- ShufflePageCount (number, 1-100)
- AutoCloseLastProcess (bool)
- PresenceUpdateRate (number, 1-9999, suffix "min")

**INI key names match legacy exactly:**
Every setting key matches the C# property names used in SettingsForm.cs, AccountManager.cs, and ServerList.cs. Settings saved by v4 are readable by legacy app and vice versa.

**UX details:**
- Escape key closes dialog
- Click outside closes dialog
- Scroll position resets when switching tabs
- Auto-save with 150ms debounce (no Save button needed)
- "saving..." indicator appears during writes
- "Done" button in footer for explicit close
- Custom toggle switches (not browser checkboxes)
- Tabs with icons, active state highlighting with sky-400 accent
- Organized with section labels and dividers
- Descriptions on non-obvious settings

**Design:**
- Matches existing zinc-950/zinc-900 dark theme from Step 8
- 520px wide modal with rounded-2xl corners
- Backdrop blur + black/60 overlay (consistent with existing modal pattern)
- scale-in animation on open
- Tab bar with pill-style buttons, active icon colored sky-400
- Toggle switches: sky-500 active, zinc-700 inactive, white knob
- Number inputs: zinc-800/60 bg, sky-500/40 focus border
- Hover states on toggles: white/2% background tint

**What works:**
- TypeScript compiles with zero errors
- Vite production build succeeds (249KB JS, 33KB CSS)
- All 5 tabs render correctly
- Settings gear button in toolbar opens the dialog
- Dialog closes on Escape, backdrop click, X button, and Done button
- Settings reload in parent store on close via `reloadSettings`

**What doesn't work yet / deferred:**
- StartOnPCStartup writes to INI but doesn't actually modify Windows Registry (needs platform layer, Step 13)
- Encryption reset button not ported (was in legacy General tab via EncryptionSelectionButton)
- Custom ClientAppSettings file picker (was in legacy Miscellaneous tab)
- Force Update button (deferred to Step 16: Auto-Updater)
- Theme editor (separate dialog, planned for Step 11 or separate)

**Decisions made:**
- Watcher settings consolidated into Settings dialog (legacy had them in ServerList form)
- WebServer tab visibility gated on DevMode OR EnableWebServer (matches legacy where the tab was always visible but within the Developer tab)
- Auto-save with debounce instead of per-change save (better UX, fewer disk writes)
- No external dependencies added — pure React + Tailwind
- useSettings hook is internal to SettingsDialog (not shared) since only the dialog needs per-field granular access
- Store gets `reloadSettings` for refreshing the parent's cached settings after dialog closes

**Blockers for next step:**
None. Ready for Step 10 (Frontend - Server List & Games).

### Step 10: Frontend — Server List & Game Browser
**Date:** 2026-02-06

**What was done:**
Built the Server List dialog as a full modal with 4 tabs: Servers, Games, Favorites, Recent. Wired to the "Server List" button in the detail sidebar.

**Files created (1):**
- `src/components/ServerListDialog.tsx` — complete server list dialog (~950 lines)

**Files modified (3):**
- `src/store.tsx` — added `serverListOpen`, `setServerListOpen` to StoreValue and provider
- `src/App.tsx` — imported and rendered ServerListDialog, wired to store state
- `src/components/DetailSidebar.tsx` — changed "Server List" button from "coming soon" toast to opening the dialog

**ServerListDialog architecture:**

4-tab modal (680x560px) matching existing dark theme:
- Tab bar with animated pill indicator (same pattern as SettingsDialog)
- Escape/backdrop click to close

**Servers Tab:**
- Place ID input + Refresh/Stop toggle button
- Place name display (resolved via get_place_details)
- Server table: #, Players (with fill bar), Ping, FPS, Region
- Player fill bars color-coded: emerald (<70%), amber (70-90%), red (>90%)
- Cursor-based pagination loads all public servers automatically
- Stop button cancels mid-load via busyRef flag
- Right-click context menu: Join Server, Copy Job ID, Load Region
- Load Region: calls join_game_instance to get server IP, then ipapi.co for geolocation
- Teleport Place ID input for multi-place games (sets isTeleport flag)
- Player finder: username input + search button with page counter progress
  - Gets target avatar headshot URL, then scans server pages comparing player token thumbnails
  - When found, clears server list and shows only the matching server
- Server count + total player count in footer

**Games Tab:**
- Search input with 400ms debounce
- Auto-loads popular games on mount (via search_games with empty keyword)
- 2-column grid of game cards: icon, name, player count, like ratio bar
- Game icons loaded via batched_get_game_icon (PlaceId→UniverseId→GameIcon)
- Click game → fills Place ID and switches to Servers tab, adds to recent
- Right-click context menu: Join Game, Favorite (with custom name prompt), Copy Place ID
- Player counts formatted as K (e.g. 12.5K)

**Favorites Tab:**
- Persisted in localStorage (key: ram_favorite_games)
- List of saved games with icon, name, Place ID, VIP badge
- Right-click: Join Game, Rename (prompt), Remove, Copy Place ID
- Empty state with star icon and instruction text
- Added from Games tab via right-click → Favorite (prompts for custom name)

**Recent Tab:**
- Persisted in localStorage (key: ram_recent_games)
- Capped to MaxRecentGames setting (default 8, configurable in Settings)
- List with icon, name, Place ID, relative time (e.g. "2h ago")
- Clear all button
- Auto-populated when selecting games or joining servers

**Data types defined (local to component):**
- `ServerData` — matches Rust ServersResponse.data fields
- `ServersResponse` — data + next_page_cursor
- `PlaceDetails` — from get_place_details IPC
- `GameEntry` — placeId, name, playerCount, likeRatio, iconUrl, universeId
- `FavoriteGame` — placeId, name, iconUrl, addedAt, privateServer?
- `RecentGame` — placeId, name, iconUrl, lastPlayed
- `ServerRegion` — region string + loading flag

**Context menus (3 separate):**
- ServerContextMenu: Join Server, Copy Job ID, Load Region
- GameContextMenu: Join Game, Favorite, Copy Place ID
- FavoriteContextMenu: Join Game, Rename, Remove, Copy Place ID
- All with position clamping, escape/click-outside dismissal, scale-in animation

**Tauri IPC commands used:**
- `get_place_details` — resolve Place ID to name
- `get_servers` — paginated server list
- `lookup_user` — player finder username lookup
- `get_avatar_headshots` — player finder avatar resolution
- `batch_thumbnails` — player finder token comparison
- `join_game_instance` — join server + region IP extraction
- `search_games` — game discovery (popular + keyword)
- `batched_get_game_icon` — game icon loading

**Design:**
- Matches existing zinc-950/zinc-900 dark theme
- Sky-500 accent on active elements
- Same pill tab bar animation as SettingsDialog
- Same context menu styling (backdrop blur, scale-in, rounded-xl)
- Server fill bars with color gradients
- Spinner animation for loading states
- Custom font-mono for IDs, Place IDs, ping values

**What works:**
- TypeScript compiles with zero errors
- Vite production build: 309KB JS, 43KB CSS
- Tauri dev mode launches and renders the dialog
- All 4 tabs render correctly
- Server List button in sidebar opens the dialog

**What doesn't work yet / deferred:**
- Player finder token-based comparison needs real testing (batch_thumbnails with token field may need Rust-side adjustment)
- Load Region uses ipapi.co directly from frontend (may need CORS proxy or Rust-side fetch in production)
- search_games endpoint returns 401 without auth cookie (known issue from Step 7)
- VIP server browsing not wired (need auth, separate server_type="VIP" call)
- Game icons may not resolve for all games (depends on universe lookup success)
- FavoriteGames.json compatibility with legacy (using localStorage instead — migration not needed since legacy stored in different location)

**Decisions made:**
- localStorage for favorites and recent games (simpler than JSON files, no Rust commands needed)
- No new Rust code or crate dependencies — all existing IPC commands sufficient
- Load Region uses ipapi.co REST API directly (configurable API deferred to later)
- Player finder uses avatar URL comparison (matching legacy C# approach exactly)
- Games tab parses both omni-search and discovery-api response formats (different structures for keyword vs popular)
- Recent games auto-populated from game selection and server joins
- 400ms debounce on game search to avoid excessive API calls
- Context menus are component-local (not shared with main app context menu)

**Blockers for next step:**
None. Ready for Step 11 (Frontend - Account Utility Dialogs).

### Step 11: Frontend — Account Utility Dialogs
**Date:** 2026-02-06

**What was done:**
Built 6 new dialog/form components and wired 3 missing Tauri command wrappers. Added CSS theme variable system with live preview.

**Rust changes (1 file modified):**
- `src-tauri/src/lib.rs` — Added 3 new `#[tauri::command]` wrappers:
  - `change_password(state, user_id, current_password, new_password)` → calls `auth::change_password`, updates stored cookie if new cookie returned (same pattern as `refresh_cookie`)
  - `change_email(state, user_id, password, new_email)` → calls `auth::change_email`
  - `set_display_name(state, user_id, display_name)` → calls `auth::set_display_name`
  - All 3 registered in `generate_handler![]`

**Files created (6 new components):**

1. `src/components/ImportDialog.tsx` (~170 lines)
   - 2-tab modal (560x420px): Import by Cookie, Import by User:Pass
   - Cookie tab: textarea (one per line), validates each, checks for duplicates by UserID, adds via `add_account`
   - User:Pass tab: textarea (username:password per line), looks up user via `lookup_user`, stores with password but no cookie
   - Progress indicator ("Importing 3/10..."), color-coded results (green=success, red=failure)
   - Drag-and-drop support on cookie textarea

2. `src/components/AccountFieldsDialog.tsx` (~130 lines)
   - Dynamic key-value editor (400x400px modal)
   - Scrollable list of `[key input] [value input] [X delete]` rows
   - "+" button adds new row with defaults "Field" / "Value"
   - Save on Enter in value field → rebuilds Fields object → `updateAccount()` → green flash on title (300ms)
   - Delete removes row + saves immediately

3. `src/components/AccountUtilsDialog.tsx` (~380 lines)
   - Largest dialog (540x600px), scrollable with section headers
   - **Info Banner:** avatar, username, UserID (mono), robux (fetched on open), email status
   - **Profile:** Display Name input + Set button → `set_display_name`; Follow Privacy dropdown (5 options) → `set_follow_privacy`
   - **Security:** Current/New Password → `change_password`; Email → `change_email`; PIN (4-digit numeric, Enter submits) → `unlock_pin`; Sign out of other sessions (confirm dialog) → `refresh_cookie`
   - **Social:** Username input shared by Block (`block_user`) and Add Friend (`send_friend_request`); expandable Blocked Users list (`get_blocked_users`, handles 403 gracefully); per-user Unblock + Unblock All with confirm
   - **Outfits:** Username input (defaults to account), Load Outfits → `get_outfits`; selectable list, Wear Outfit → `get_outfit_details` + `set_avatar`; if invalid asset IDs returned → triggers MissingAssetsDialog via `store.setMissingAssets()`

4. `src/components/MissingAssetsDialog.tsx` (~155 lines)
   - Auto-opens when `store.missingAssets` is non-null (440x400px)
   - Loads thumbnails via `get_asset_thumbnails` and details via `get_asset_details` for each missing asset
   - Each row: thumbnail (40x40), asset name, price, Buy button (if `IsForSale`)
   - Buy with confirm → `purchase_product(userId, productId, price, creatorId)`

5. `src/components/ThemeEditorDialog.tsx` (~250 lines)
   - Split layout (480x520px): left category list (160px) + right controls panel
   - 5 categories: Accounts, Buttons, Forms, Text Boxes, Labels
   - Color pickers: native `<input type="color">` with hex value display
   - Category-specific controls:
     - Accounts: BG, FG, Show Headers toggle
     - Buttons: BG, FG, Border, Button Style cycle (Flat→Popup→Standard)
     - Forms: BG, FG, Dark Top Bar toggle
     - Text Boxes: BG, FG, Border
     - Labels: BG, FG, Transparent BG toggle
   - Live preview: each change immediately updates CSS custom properties on `document.documentElement`
   - Save → `invoke("update_theme", { theme })` + toast; Reset to Defaults → restores zinc defaults
   - Default theme constants defined as `DEFAULT_THEME` object

6. `src/components/ArgumentsForm.tsx` (~100 lines)
   - Small popover (280px wide), anchored to gear icon button in Launch section
   - "Is Teleport" checkbox → `update_setting("Developer", "IsTeleport", value)`
   - "Use Old Join Method" checkbox → `update_setting("Developer", "UseOldJoin", value)`
   - Roblox Version input + "Set" button → `update_setting("Developer", "CurrentVersion", value)`
   - Click-outside and Escape to dismiss

**Files modified (6):**

- `src/store.tsx` (+35 lines):
  - New state: `accountUtilsOpen`, `accountFieldsOpen`, `importDialogOpen`, `themeEditorOpen`, `missingAssets`
  - New function: `applyThemeCss(theme: ThemeData)` — maps ThemeData fields to CSS custom properties
  - Called on startup after `get_theme()` to apply persisted theme

- `src/index.css` (+15 lines):
  - Added `:root` CSS custom properties: `--accounts-bg`, `--accounts-fg`, `--buttons-bg`, `--buttons-fg`, `--buttons-bc`, `--forms-bg`, `--forms-fg`, `--textboxes-bg`, `--textboxes-fg`, `--textboxes-bc`, `--labels-bg`, `--labels-fg`
  - Default values match zinc dark theme

- `src/App.tsx` (+20 lines):
  - Imported and mounted all 6 new dialogs (ImportDialog, AccountFieldsDialog, AccountUtilsDialog, MissingAssetsDialog, ThemeEditorDialog)

- `src/components/DetailSidebar.tsx` (+25 lines):
  - "Utilities" button → `store.setAccountUtilsOpen(true)` (was "coming soon" toast)
  - "Theme" button → `store.setThemeEditorOpen(true)` (was "coming soon" toast)
  - Added gear icon button next to "Join Server" that opens ArgumentsForm popover
  - Imported `ArgumentsForm` component and `useRef` hook

- `src/components/Toolbar.tsx` (changed 6 lines):
  - Both "Import Cookie" and "Import User:Pass" menu items → `store.setImportDialogOpen(true)` (was `window.prompt` and "coming soon" toast)

- `src/components/ContextMenu.tsx` (changed 2 lines):
  - "View/Edit Fields" → `store.setAccountFieldsOpen(true)` (was JSON modal via `store.showModal`)

**CSS Theme Variable System:**
Theme colors flow: ThemeData (Rust INI) → `applyThemeCss()` (store.tsx) → CSS custom properties → component styles via `var(--prop)`. ThemeEditorDialog updates CSS vars in real-time for live preview, persists on Save via `update_theme` IPC.

**What works:**
- TypeScript compiles with zero errors (`bun run tsc --noEmit`)
- Rust compiles with zero errors (only pre-existing dead_code warnings)
- Tauri dev mode launches successfully
- All 6 new dialogs render with correct styling
- Import both paths (Cookie and User:Pass) functional
- AccountFields editor saves on Enter with green flash
- Theme editor live preview updates instantly
- All triggers wired (DetailSidebar, Toolbar, ContextMenu)

**What doesn't work yet / deferred:**
- Components not yet updated to use `var(--prop)` CSS variables extensively (AccountList rows, buttons, inputs still use Tailwind hardcoded colors) — can be progressively adopted
- `get_blocked_users` returns 403 (known issue from Step 6) — dialog shows "Unable to load blocked users" message
- `get/set_private_server_invite_privacy` omitted from UI (endpoint removed by Roblox)
- User:Pass import creates accounts without cookies — operations requiring auth fail until cookie obtained via refresh or manual import
- Email verified status read from `validate_cookie` response — the AccountInfo struct may not include `email_verified` field (will show "Unknown" if missing)

**Decisions made:**
- ImportDialog combines both import modes in tabs (legacy had separate ImportForm for cookies only, no User:Pass bulk import)
- AccountFieldsDialog replaces the JSON modal that was in ContextMenu (richer editing UX)
- AccountUtilsDialog is a single scrollable page with section headers (legacy was a flat form)
- MissingAssetsDialog auto-opens via store state (no explicit trigger needed)
- ArgumentsForm is a popover anchored to a gear icon, not a separate dialog (less modal fatigue)
- CSS theme variables use `:root` scope (global, simple, no scoping issues)
- Theme defaults match zinc dark theme (not legacy WinForms colors)
- No new npm or Cargo dependencies added

**Blockers for next step:**
None. Ready for Step 12 (Browser-Based Account Login).

### Step 12: Browser-Based Account Login
**Date:** 2026-02-06

**What was done:**
Ported the browser-based account login system from CefSharp/Puppeteer to Tauri's native WebviewWindow API. Two features implemented: "Browser Login" (add new account by logging in via browser) and "Open Browser" (browse roblox.com as an existing account).

**Files created (1):**
- `src-tauri/src/browser.rs` — Browser window management module (~100 lines)

**Files modified (5):**
- `src-tauri/Cargo.toml` — Added `cookie = "0.18"` dependency (matches tauri's transitive dep)
- `src-tauri/src/lib.rs` — Registered `browser` module, added 4 commands to `generate_handler![]`
- `src/store.tsx` — Added `openLoginBrowser()`, `openAccountBrowser()` methods + `listen("browser-login-detected")` event handler
- `src/components/layout/Toolbar.tsx` — Added "Browser Login" as first item in Add dropdown with globe icon + separator
- `src/components/accounts/SingleSelectSidebar.tsx` — Wired "Browser" tool button to `store.openAccountBrowser(account.UserID)`

**Tauri commands (4 new):**
- `open_login_browser(app: AppHandle)` — Creates a 900x720 WebviewWindow loading roblox.com/login. Uses `on_navigation` callback to detect when user navigates to /home, /discover, or / (login success). Emits `browser-login-detected` event via `app.emit()`. Uses `AtomicBool` to ensure event fires only once per session.
- `extract_browser_cookie(app: AppHandle)` — Gets the login browser WebviewWindow by label, calls `cookies_for_url("https://www.roblox.com")`, finds `.ROBLOSECURITY` cookie, returns its value.
- `close_login_browser(app: AppHandle)` — Closes the login browser window if open.
- `open_account_browser(app: AppHandle, state: AccountStore, user_id: i64)` — Creates a 1100x750 WebviewWindow. Loads `about:blank`, injects the account's `.ROBLOSECURITY` cookie via `set_cookie()` (domain=.roblox.com, secure, httpOnly), then navigates to roblox.com/home via `eval()`.

**Cookie API approach:**
Used Tauri v2's built-in high-level cookie API (via wry 0.54.1):
- `WebviewWindow::cookies_for_url(url)` — reads all cookies including HttpOnly (uses WebView2's ICoreWebView2CookieManager internally)
- `WebviewWindow::set_cookie(cookie)` — injects cookies (uses WebView2's AddOrUpdateCookie internally)
- No raw COM interop needed — Tauri/wry wraps WebView2 and WKWebView natively
- `cookie` crate v0.18 used for `Cookie::build()` to construct cookie with domain/secure/httpOnly attributes

**Frontend event flow (login):**
1. User clicks "Browser Login" in Add dropdown → `invoke("open_login_browser")`
2. Rust creates WebviewWindow loading roblox.com/login
3. User completes login (including 2FA, CAPTCHA) in the browser
4. Roblox redirects to /home → `on_navigation` fires → `app.emit("browser-login-detected")`
5. Frontend receives event (via `listen()` from `@tauri-apps/api/event`), waits 500ms for cookies to settle
6. Frontend calls `invoke("extract_browser_cookie")` → gets `.ROBLOSECURITY` value
7. Frontend calls `addAccountByCookie(cookie)` → validates via `validate_cookie`, adds via `add_account`
8. Frontend calls `invoke("close_login_browser")` → browser window closes
9. Toast notification confirms account added

**Frontend event flow (open browser):**
1. User selects account, clicks "Browser" in sidebar tools → `invoke("open_account_browser", { userId })`
2. Rust looks up account's SecurityToken, creates WebviewWindow with `about:blank`
3. Injects .ROBLOSECURITY cookie before navigation
4. Navigates to roblox.com/home via eval()
5. User browses roblox.com fully authenticated

**Edge cases handled:**
- Duplicate browser windows: existing windows closed before creating new ones (by label)
- User closes browser without logging in: no event emitted, nothing happens
- Cookie not found after navigation: `extract_browser_cookie` returns descriptive error, shown as toast
- Multiple login attempts: `AtomicBool` prevents duplicate event emission per session
- Account not found: `open_account_browser` returns error if userId not in AccountStore

**Key differences from legacy:**
- No Chromium download needed (uses OS WebView2/WKWebView)
- No Puppeteer/CefSharp dependency (~100 lines Rust vs ~400 lines C#)
- No proxy support (deferred — legacy had proxy chain for bulk imports)
- No auto-fill credentials (deferred — legacy typed into login form via automation)
- No CAPTCHA solver integration (deferred — legacy had Nopecha integration)
- No bulk import batching with grid tiling (deferred — can add multiple simultaneous login windows later)
- No BrowserConfig.json custom scripts (deferred — was a power-user feature)
- No dark theme injection (webview respects OS dark mode preference)

**What works:**
- Rust compiles with zero new errors (only pre-existing dead_code warnings)
- TypeScript compiles with zero errors (`bun run tsc --noEmit`)
- Browser Login option appears in Add dropdown with globe icon
- Open Browser button wired in sidebar tools

**What doesn't work yet / deferred:**
- Proxy support for login browser (legacy feature, rare usage)
- Auto-fill username/password in login form (legacy User:Pass bulk import feature)
- Nopecha CAPTCHA solver integration
- Bulk import grid tiling (multiple simultaneous browser windows)
- BrowserConfig.json pre/post navigation scripts
- Password extraction from login form (legacy captured password from request body)
- Cookie injection timing edge case: if WebView2 starts loading before set_cookie completes, the first request might not have the cookie (mitigated by loading about:blank first)

**Decisions made:**
- Used `about:blank` → `set_cookie()` → `eval(navigate)` pattern for cookie injection to avoid race conditions
- AtomicBool for one-shot event emission (simpler than channels or state machines)
- 500ms delay before cookie extraction (gives WebView2 time to finalize cookie storage)
- No capabilities changes needed — window creation from Rust doesn't require frontend permissions
- Browser windows are full unmanaged windows (title bar, close button) unlike main window (decorations: false)
- Labels: "login-browser" for login window, "account-browser-{userId}" for per-account windows

**Blockers for next step:**
None. Ready for Step 13 (Windows Platform — Multi-Roblox, Launching, Watcher).

---

### Step 13: Windows Platform — Multi-Roblox, Launching, Watcher
**Date:** 2026-02-06

**What was done:**

Full Windows platform layer for Roblox process management, game launching, and process monitoring.

**Files created/modified:**

1. **`src-tauri/Cargo.toml`** — Added `windows-sys` 0.59 target dependency with features: `Win32_Foundation`, `Win32_Security`, `Win32_System_Threading`, `Win32_System_Diagnostics_ToolHelp`, `Win32_System_Registry`, `Win32_UI_WindowsAndMessaging`

2. **`src-tauri/src/platform/windows.rs`** — Complete rewrite (~549 lines):
   - Win32 FFI via `windows-sys` 0.59 — all handles use `HANDLE`/`HWND` (`*mut c_void`) types
   - `SendHandle` wrapper for `Mutex<Option<HANDLE>>` static (raw pointers aren't Send)
   - Multi-Roblox: `enable_multi_roblox()` acquires "ROBLOX_singletonMutex" via `CreateMutexW` + `WaitForSingleObject`; `disable_multi_roblox()` releases
   - Roblox path: `get_roblox_path()` — registry `HKCR\roblox\DefaultIcon` → parent folder, fallback to `%LOCALAPPDATA%\Roblox\Versions\version-*`
   - Process management: `get_roblox_pids()` via `CreateToolhelp32Snapshot`, `kill_process()` via `OpenProcess`+`TerminateProcess`, `kill_all_roblox()`
   - Launch: `build_launch_url()` constructs `roblox-player:` protocol URL (3 modes: normal/VIP/follow); `launch_url()` via `cmd /C start`
   - FPS unlocker: `apply_fps_unlock()` patches `ClientSettings/ClientAppSettings.json` with `DFIntTaskSchedulerTargetFps`
   - Window management: `find_main_window()` via `EnumWindows` callback, `get_window_position()`/`set_window_position()` via `GetWindowRect`/`MoveWindow`
   - Memory: `get_process_memory_mb()` via direct extern `K32GetProcessMemoryInfo` (no extra feature needed)
   - `ProcessTracker` — thread-safe `LazyLock` static tracking userId→{pid, browserTrackerId} with AtomicBool flags for watcher/cancel/next
   - `generate_browser_tracker_id()` — deterministic from SystemTime nanos (matches legacy 12-digit format)

3. **`src-tauri/src/data/settings.rs`** — Added 4 convenience methods on `SettingsStore`: `get_bool()`, `get_int()`, `get_float()`, `get_string()`

4. **`src-tauri/src/lib.rs`** — Added 14 new Tauri commands:
   - `launch_roblox(user_id, place_id, job_id, launch_data, follow_user, join_vip, link_code, shuffle_job)` — Full launch flow: get cookie, shuffle if requested, get auth ticket, auto-kill old instance, apply FPS unlock, enable multi-roblox, build URL, launch, detect new PID, restore window position (background task)
   - `launch_multiple(user_ids, place_id, job_id, launch_data)` — Sequential multi-account launch with AccountJoinDelay, per-account SavedPlaceId/SavedJobId override, AsyncJoin support, cancellation via AtomicBool
   - `cancel_launch()` / `next_account()` — control signals for multi-launch
   - `cmd_kill_roblox(user_id)` / `cmd_kill_all_roblox()` — process termination
   - `get_running_instances()` — returns `Vec<RunningInstance>` (pid, user_id, browser_tracker_id)
   - `cmd_enable_multi_roblox()` / `cmd_disable_multi_roblox()` — mutex control
   - `cmd_get_roblox_path()` — Roblox installation detection
   - `cmd_apply_fps_unlock(max_fps)` — FPS patch
   - `start_watcher(app, settings)` — spawns background task that checks processes every N seconds: cleanup dead processes (emit `roblox-process-died`), memory check (emit `roblox-low-memory`), title check (emit `roblox-title-mismatch`), window position saving
   - `stop_watcher()` — stops background task via AtomicBool
   - Added `tauri::Manager` and `tauri::Emitter` imports

5. **`src/store.tsx`** — Updated `joinServer()` to call `launch_roblox` with `shuffleJob` parameter instead of `join_game_instance`/`join_game`

6. **`src/components/accounts/SingleSelectSidebar.tsx`** — Updated Follow handler to actually call `launch_roblox` with `followUser: true` after user lookup and presence check

7. **`src/components/accounts/MultiSelectSidebar.tsx`** — Updated Join All to call `launch_multiple` instead of sequential `joinServer()` calls with frontend delay

**What works:**
- Full build compiles without errors (warnings only for unused code from earlier steps)
- App launches and runs
- All 14 new Tauri commands registered in `generate_handler![]`
- Cross-platform compilation: all commands use `#[cfg(target_os = "windows")]` with fallback stubs

**What doesn't work yet / Not tested:**
- Actual game launching (requires valid Roblox cookie and Roblox installation)
- Multi-account launch queue (needs end-to-end test with real accounts)
- Watcher background task (needs running Roblox processes to monitor)
- Window position save/restore (needs real game windows)
- `launch_multiple` emits `launch-progress` and `launch-complete` events — frontend doesn't listen to them yet (can be wired in Polish step)

**Key technical decisions:**
- `HANDLE`/`HWND` in windows-sys 0.59 are `*mut c_void`, not `isize` — required `SendHandle` wrapper for `Mutex<Option<HANDLE>>` static
- `ProcessTracker` uses static `LazyLock` instead of Tauri managed state — simpler access from background tasks (watcher, window position) without needing `AppHandle`
- Watcher uses `app.state::<AccountStore>()` inside spawned task (not clone) since AccountStore contains Mutex and can't derive Clone
- `shuffle_job` is a dedicated boolean parameter rather than using magic string (e.g., "shuffle") in jobId
- `K32GetProcessMemoryInfo` declared as direct extern (no extra windows-sys feature flag needed)
- PID detection for new process: compare `get_roblox_pids()` before and after launch with 3-second delay
- Window position restoration: spawns background task polling `find_main_window()` every 1 second for up to 45 seconds

**Tauri events emitted:**
| Event | Payload | When |
|-------|---------|------|
| `launch-progress` | `{userId, index, total}` | During multi-account launch |
| `launch-complete` | `{}` | Multi-account launch finished |
| `roblox-process-died` | `{userId}` | Watcher detects dead process |
| `roblox-low-memory` | `{userId, memoryMb}` | Watcher detects low memory |
| `roblox-title-mismatch` | `{userId, title, expected}` | Watcher detects wrong title |

**Settings used by launch/watcher (from RAMSettings.ini `[General]`):**
- `EnableMultiRbx` — enable multi-Roblox mutex acquisition
- `FPSLimit` — FPS unlock target
- `AccountJoinDelay` — seconds between multi-account launches (default 8)
- `AsyncJoin` — wait for `next_account` signal instead of delay
- `WatcherCheckInterval` — seconds between watcher checks (default 10)
- `WatcherMemoryCheck` / `WatcherMemoryLimit` — memory monitoring
- `WatcherTitleCheck` / `WatcherExpectedTitle` — title monitoring
- `RememberWindowPositions` — save window positions to account fields

**Blockers for next step:**
None. Ready for Step 14 (Local Web Server / Developer API).

---

### Step 14: Local Web Server (Developer API)
**Date:** 2026-02-06

**What was done:**
Ported the legacy C# `WebServer.cs` + `AccountManager.SendResponse()` HTTP API to Rust using `axum` 0.8. The server runs as a background tokio task alongside the Tauri app, started manually or auto-started when `EnableWebServer` is true.

**Files created (1):**
- `src-tauri/src/api/server.rs` (~1300 lines) — Complete axum HTTP server with all 24 legacy endpoints

**Files modified (4):**
- `src-tauri/Cargo.toml` — Added `axum = "0.8"` dependency
- `src-tauri/src/api/mod.rs` — Added `pub mod server;`
- `src-tauri/src/lib.rs` — Added 3 Tauri commands + `.setup()` hook for auto-start + command registration
- `src/components/settings/WebServerTab.tsx` — Added server start/stop button with live status display

**Server Architecture (`server.rs`):**

State management:
- `AppState` struct holds `&'static AccountStore` and `&'static SettingsStore` (safe because Tauri manages state in `Arc` that lives for the app's lifetime)
- `SERVER_STATE` — `LazyLock<Mutex<Option<ServerHandle>>>` static holding the shutdown sender and port
- Shutdown via `tokio::sync::watch` channel — clean graceful shutdown

Middleware:
- External connection check: if `AllowExternalConnections` is false, rejects non-loopback IPs (via `axum::extract::ConnectInfo<SocketAddr>`)

V2 API support:
- All endpoints registered at both `/Endpoint` (v1) and `/v2/Endpoint` paths
- V1: returns raw text, adds `ws-error` header on error (status > 299)
- V2: returns JSON `{"Success": bool, "Message": string}` wrapper

Account resolution:
- `find_account(accounts, identifier)` — matches by `username` OR `user_id.to_string()` (matching legacy `AccountsList.FirstOrDefault(x => x.Username == Account || x.UserID.ToString() == Account)`)

Password checking:
- `check_password(state, password)` — reads `WebServer.Password` setting, requires 6+ chars to be active, matches exact string

**All 24 Endpoints (matching legacy exactly):**

| Method | Path | Permission | Handler |
|--------|------|-----------|---------|
| GET | `/Running` | none | Health check, returns "true" (v1) or success message (v2) |
| GET | `/GetAccounts` | AllowGetAccounts + password | Comma-separated usernames, optional Group filter |
| GET | `/GetAccountsJson` | AllowGetAccounts + password | JSON array with Username, UserID, Alias, Description, Group, Fields; optional IncludeCookies (requires AllowGetCookie + password) |
| GET | `/ImportCookie` | none | Validates cookie via `auth::validate_cookie`, adds account |
| GET | `/GetCookie` | AllowGetCookie + password | Returns .ROBLOSECURITY for account |
| GET | `/GetCSRFToken` | none | Returns CSRF token via `auth::get_csrf_token` |
| GET | `/LaunchAccount` | AllowLaunchAccount + password | Launches Roblox with PlaceId, optional JobId/FollowUser/JoinVIP (Windows only) |
| GET | `/FollowUser` | AllowLaunchAccount + password | Resolves username via `roblox::get_user_id`, launches with follow |
| GET | `/SetServer` | none | Calls `roblox::join_game_instance` |
| GET | `/SetRecommendedServer` | none | Fetches servers, tries joining in reverse order (best→worst), tracks attempted joins, max 10 retries |
| GET | `/GetAlias` | none | Returns account alias |
| GET | `/GetDescription` | none | Returns account description |
| GET | `/GetField` | none | Returns field value from account.fields |
| POST | `/SetField` | AllowAccountEditing | Sets field on account, saves via AccountStore.update() |
| POST | `/RemoveField` | AllowAccountEditing | Removes field from account |
| POST | `/SetAlias` | AllowAccountEditing | Sets alias from request body |
| POST | `/SetDescription` | AllowAccountEditing | Sets description from body |
| POST | `/AppendDescription` | AllowAccountEditing | Appends body to description |
| POST | `/SetAvatar` | none | Parses JSON body, calls `roblox::set_avatar` |
| POST | `/BlockUser` | none | Calls `roblox::block_user` |
| POST | `/UnblockUser` | none | Calls `roblox::unblock_user` |
| GET | `/GetBlockedList` | none | Returns JSON from `roblox::get_blocked_users` |
| POST | `/UnblockEveryone` | none | Calls `roblox::unblock_all_users` |

**Tauri Commands (3 new):**
- `start_web_server(app: AppHandle) -> Result<u16, String>` — Extracts stores from app state, calls `server::start()`, returns bound port
- `stop_web_server() -> Result<(), String>` — Signals shutdown via watch channel
- `get_web_server_status() -> Result<WebServerStatus, String>` — Returns `{running: bool, port: u16}`

**Auto-start:**
In `.setup()` hook: if `Developer.EnableWebServer` is true, spawns async task to start web server. Logs port or error to stderr.

**Frontend changes (`WebServerTab.tsx`):**
- Polls `get_web_server_status` every 3 seconds
- Shows "Running on port 7963" or "Not running" status
- Start button (emerald) / Stop button (red) toggles server
- Loading state during toggle operation

**Query parameter handling:**
All params case-insensitive via serde `alias`: `Account`/`account`, `Password`/`password`, `PlaceId`/`placeId`/`placeid`, etc.

**What works:**
- Rust compiles with zero errors (only pre-existing dead_code warnings from other modules)
- Frontend TypeScript compiles with zero errors
- Full `cargo tauri dev` launches successfully
- Server start/stop button renders in WebServer settings tab
- All 24 endpoints defined with both v1 and v2 variants

**What doesn't work yet / Not tested:**
- Actual HTTP requests (requires valid accounts + enabled web server setting)
- LaunchAccount/FollowUser (requires Windows + Roblox installation)
- SetRecommendedServer retry logic (needs live servers)
- Password protection flow (needs manual testing with curl)
- External connection rejection (needs non-localhost client)

**Key differences from legacy:**
- Uses `axum` instead of `System.Net.HttpListener`
- Graceful shutdown via `watch` channel (legacy used `HttpListener.Stop()`)
- Account state shared via `&'static` references (safe, Tauri state is `Arc`-backed)
- No UI thread dispatch needed for account mutations (legacy called `UpdateAccountView` on UI thread)
- CSRF token fetched on-demand per request (legacy had cached `GetCSRFToken()` per account)
- SetRecommendedServer fetches servers at request time (legacy used cached `ServerList.servers`)

**Decisions made:**
- `axum` over `actix-web` — lighter, tokio-native, no macro magic, smaller binary impact
- `&'static` references via pointer cast (not `Arc` wrapping) — cleaner, avoids double-Arc since Tauri already stores in Arc
- All endpoints registered explicitly as v1 + v2 pairs (not middleware-based prefix stripping) — more explicit, easier to debug
- `LazyLock<Mutex<Option<ServerHandle>>>` for server lifecycle — same pattern as `ProcessTracker` from Step 13
- Default port 7963 (matching legacy exactly)
- Bind to `127.0.0.1` unless `AllowExternalConnections` is true → `0.0.0.0`

**Blockers for next step:**
None. Ready for Step 15 (Nexus / Account Control).

---

### Step 15: Nexus / Account Control
**Date:** 2026-02-06

**What was done:**

Full Nexus system ported: WebSocket server (Rust), command protocol, connection tracking, Account Control UI (React), and AccountControlData.json persistence.

**Files created:**
- `src-tauri/src/nexus/websocket.rs` — Complete rewrite from 3-line stub to ~720 lines. WebSocket server using `tokio-tungstenite` + `futures-util`. Core structures: `NexusServer` (static `LazyLock`), `ControlledAccount`, `NexusConnection`, `CustomElement`, `AccountView`, `NexusStatus`, `Command`.
- `src/components/dialogs/NexusDialog.tsx` — ~600 lines. Full Account Control dialog with 3 tabs (Control Panel, Settings, Help). Sub-components: `ControlPanel`, `SettingsPanel`, `HelpPanel`, `CollapsibleSection`, `SettingToggle`, `SettingNumber`.

**Files modified:**
- `src-tauri/Cargo.toml` — Added `tokio-tungstenite = "0.26"` and `futures-util = "0.3"`
- `src-tauri/src/lib.rs` — Added 13 Tauri commands (`start_nexus_server`, `stop_nexus_server`, `get_nexus_status`, `get_nexus_accounts`, `add_nexus_account`, `remove_nexus_accounts`, `update_nexus_account`, `nexus_send_command`, `nexus_send_to_all`, `get_nexus_log`, `clear_nexus_log`, `get_nexus_elements`, `set_nexus_element_value`). Registered all in `invoke_handler`. Added Nexus auto-start in `.setup()` hook (checks `AccountControl.StartOnLaunch` setting).
- `src/store.tsx` — Added `nexusOpen: boolean` and `setNexusOpen` state
- `src/components/accounts/SingleSelectSidebar.tsx` — Wired Nexus button to open dialog (was "coming soon" toast)
- `src/App.tsx` — Added `NexusDialog` import and rendering after `ThemeEditorDialog`

**Protocol implementation (matching legacy C# exactly):**
- Client connects: `ws://host:port/Nexus?name=<username>&id=<userId>&jobId=<jobId>`
- Client→Server: JSON `{"Name":"ping","Payload":null}` or `{"Name":"Log","Payload":{"Content":"..."}}`
- Server→Client: raw strings (NOT JSON) — e.g. `execute print("hello")`, `ButtonClicked:MyBtn`
- Command handling: ping, Log, GetText, SetRelaunch, SetAutoRelaunch, SetPlaceId, SetJobId, Echo, CreateButton/TextBox/Numeric/Label, NewLine

**What works:**
- Build compiles successfully (only pre-existing warnings)
- App launches with NexusDialog accessible via sidebar button
- All 13 Tauri commands registered and callable from frontend
- WebSocket server binds to configured port (default 5242)
- AccountControlData.json persistence (load/save with serde rename for legacy format compat)
- Frontend polls server status every 2 seconds
- Event listeners for real-time updates (nexus-log, nexus-account-connected/disconnected, nexus-element-created/newline)
- Control Panel: account list with checkboxes, status dots, context menu, command input, collapsible Script/AutoExecute/Output sections, dynamic custom elements
- Settings tab: all AccountControl settings with save via `update_setting`
- Help tab: instructions, command reference, download/docs buttons
- Auto-start on launch (if `AccountControl.StartOnLaunch` setting is true)

**What doesn't work yet / not tested:**
- Live WebSocket connections with actual Roblox clients running Nexus.lua (needs manual testing)
- Auto-relaunch timer (background task skeleton present but needs live game instances)
- Custom element rendering from Nexus.lua clients (needs live connection)
- Drag-drop from main account list to Nexus account list (not implemented, uses text input + Add button instead)
- Auto Minimize/Close Roblox buttons in Settings tab (UI present, backend not wired)
- Download Nexus.lua button (placeholder, needs embedded resource or file path)

**Architecture decisions:**
- `LazyLock<NexusServer>` static — same pattern as `ProcessTracker` from Step 13, avoids Tauri managed state for easy background task access
- `tokio-tungstenite` over `tungstenite` — async/tokio-native, matches existing async runtime
- `futures-util` for `StreamExt`/`SinkExt` on WebSocket streams
- `tokio::sync::watch` channel for graceful server shutdown (same pattern as web server in Step 14)
- `mpsc::UnboundedSender<String>` per connection for outgoing messages
- `ControlledAccount` uses `#[serde(rename = "Username")]` etc. for legacy AccountControlData.json format compatibility (unlike auth.rs which uses `alias`)
- `AccountView` separate struct for frontend serialization (runtime-only fields like `status`, `in_game_job_id` not persisted)
- Query param parsing done manually (no extra URL crate dependency)
- Frontend uses 2-second polling interval for status + account list refresh

**Blockers for next step:**
None. Ready for Step 16 (Auto-Updater & App Lifecycle).

---

## Step 16: Auto-Updater & App Lifecycle — 2026-02-06

**What was done:**

Added 5 Tauri v2 plugins for app lifecycle management:

1. **Dependencies added:**
   - Rust: `tauri-plugin-updater`, `tauri-plugin-single-instance`, `tauri-plugin-autostart`, `tauri-plugin-window-state`, `tauri-plugin-process`
   - Frontend: `@tauri-apps/plugin-updater`, `@tauri-apps/plugin-process`, `@tauri-apps/plugin-autostart`
   - Enabled `tray-icon` feature on tauri crate

2. **Files modified:**
   - `src-tauri/Cargo.toml` — 5 plugin deps + tray-icon feature
   - `package.json` — 3 frontend plugin packages
   - `src-tauri/tauri.conf.json` — updater plugin config with GitHub releases endpoint (pubkey placeholder)
   - `src-tauri/capabilities/default.json` — permissions for updater, process, autostart, window hide/show
   - `src-tauri/src/data/settings.rs` — `StartOnPCStartup` and `MinimizeToTray` defaults in General section
   - `src-tauri/src/lib.rs` — registered all 5 plugins + system tray with Show/Quit menu
   - `src/components/layout/TitleBar.tsx` — close-to-tray: reads MinimizeToTray setting, hides window instead of closing
   - `src/components/settings/GeneralTab.tsx` — wired autostart enable/disable on StartOnPCStartup toggle, added MinimizeToTray toggle
   - `src/App.tsx` — update check on startup, renders UpdateBanner between TitleBar and Toolbar

3. **New file:**
   - `src/components/layout/UpdateBanner.tsx` — thin banner showing version + download progress + relaunch

**What works:**
- App compiles and launches successfully
- All 5 plugins registered without errors
- System tray icon appears with Show/Quit context menu
- Left-click on tray icon restores window
- Single-instance enforcement (second launch focuses existing window)
- Window state persistence across restarts (position, size)
- StartOnPCStartup toggle wires through to `@tauri-apps/plugin-autostart`
- MinimizeToTray setting controls close button behavior
- Update check runs on startup and silently fails (no `latest.json` published yet)
- UpdateBanner renders with download progress when update is available

**Decisions made:**
- Updater public key is a placeholder — needs `cargo tauri signer generate` with interactive password prompt to create real keypair. Store private key as `TAURI_SIGNING_PRIVATE_KEY` env var in CI
- Tray icon uses `app.default_window_icon()` (the app icon from tauri.conf.json)
- Tray left-click: show + unminimize + focus. Right-click: menu with Show + Quit
- TitleBar reads MinimizeToTray setting on mount via invoke, cached in state
- Update check only fires when store is initialized, no password screen, and CheckForUpdates !== "false"
- Used fully typed closures for tray events (`AppHandle<Wry>`, `MenuEvent`, `TrayIcon<Wry>`, `TrayIconEvent`) to avoid type inference errors
- `MouseButtonState::Up` used in tray click handler to avoid double-firing on press+release

**Blockers for next step:**
None. Ready for Step 17 (Polish & Feature Parity Check).

---

## Step 17: Polish & Feature Parity Check (Code-Side Pass)
**Date:** 2026-02-07

**What was done (this session):**

Performed a full code-side parity audit against legacy sources:
- `_legacy/RBX Alt Manager/AccountManager.cs` (event handlers, webserver routes, launch path)
- `_legacy/RBX Alt Manager/Classes/*` (launch, watcher, client settings patcher, data/encryption behavior)
- `_legacy/RBX Alt Manager/Forms/*` (settings/forms feature surface)
- `_legacy/RBX Alt Manager/Nexus/*` (command/event surface)

Implemented high-impact parity fixes found during audit:

1) Legacy AccountData migration support (Windows DPAPI fallback)
- `src-tauri/src/data/crypto.rs`
  - Added `try_decrypt_legacy_dpapi()` using `CryptUnprotectData` + legacy entropy bytes.
- `src-tauri/src/data/accounts.rs`
  - Added fallback decode path when AccountData is not current-format plaintext/encrypted-header data.
  - Loader now attempts: plaintext JSON -> legacy DPAPI -> explicit error.
- `src-tauri/Cargo.toml`
  - Added required windows-sys feature flags for cryptography interop.

2) Launch parity: `UseOldJoin`, `IsTeleport`, and custom `ClientAppSettings.json`
- `src-tauri/src/platform/windows.rs`
  - Added `launch_old_join(...)` and `copy_custom_client_settings(...)`.
- `src-tauri/src/lib.rs`
  - Added `patch_client_settings_for_launch()` (custom settings override first, FPS unlock fallback).
  - Wired `Developer.UseOldJoin` and `Developer.IsTeleport` into both single and multi-launch paths.
  - Launch now selects old join path when configured.
- `src-tauri/src/data/settings.rs`
  - Added default for `General.CustomClientSettings`.
- `src/components/settings/MiscellaneousTab.tsx`
  - Added `CustomClientSettings` path field.
  - Locked Unlock FPS toggle behavior while custom settings path is active (legacy behavior parity).

3) WebServer password/routing parity adjustments
- `src-tauri/src/api/server.rs`
  - Added middleware handling for `WebServer.EveryRequestRequiresPassword`.
  - Updated protected-method password behavior (`check_password`) to match legacy expectations:
    - password must be configured (6+ chars),
    - optional per-request behavior unless "Every Request Requires Password" is enabled.
  - Updated launch/follow endpoints to honor `UseOldJoin` + `IsTeleport`.
  - Added custom client settings/FPS patch call before webserver-triggered launches.

4) Join/import/runtime UX parity fixes
- `src/store.tsx`
  - `joinServer()` now parses VIP/private-link style job input (`VIP:...`, `privateServerLinkCode=...`, `code=...`) and sets `joinVip/linkCode`.
  - Added watcher toast listeners for `roblox-beta-detected` and `roblox-no-connection`.
- `src/components/layout/Toolbar.tsx`
- `src/components/dialogs/ImportDialog.tsx`
  - Fixed imported `user:pass` account payload to send valid ISO datetime for `LastAttemptedRefresh` (prevents backend datetime parse failures).

**Build/validation results:**
- `cargo check` (src-tauri): PASS
- `bun run build` (frontend): PASS

---

### Step 17 Checklist Status (code-side)
Legend:
- `[x]` implemented in current code
- `[~]` implemented but requires runtime/visual/manual verification
- `[ ]` missing or only partial parity

Context Menu (right-click account):
- [~] Set Alias
- [~] Set Description
- [~] Copy Cookie
- [~] Copy Username
- [~] Copy Password
- [~] Copy User:Pass Combo
- [~] Copy User ID
- [~] Copy Profile Link
- [~] Copy rbx-player Link (dev mode)
- [~] Copy App Link (dev mode)
- [~] Get Authentication Ticket (dev mode)
- [~] View/Edit Fields
- [~] Remove Account
- [~] Move to Group
- [~] Copy Group
- [~] Sort Alphabetically
- [~] Toggle group visibility
- [~] Show Details
- [~] Quick Login

Main Window:
- [~] PlaceId / JobId / LaunchData inputs
- [~] Join Server button
- [~] Server List button
- [~] Save PlaceId/JobId per account
- [~] Shuffle JobId toggle
- [~] Recent Games dropdown
- [~] Add Account (single, cookies, user:pass)
- [~] Add Account via browser login
- [~] Settings
- [~] Account Utilities
- [~] Account Control (Nexus)
- [~] Open Browser (logged in as account)
- [~] Join Group button
- [~] Edit Theme
- [~] Search/filter bar
- [~] Hide Usernames toggle
- [~] Account freshness indicators
- [~] Avatar headshot images
- [~] Drag and drop reorder
- [~] Account groups with collapse

Settings:
- [~] Every setting from the General tab
- [~] Every setting from the Developer tab
- [~] Every setting from the WebServer tab
- [~] Every setting from the Watcher tab
- [~] Every setting from the Miscellaneous tab
- [~] Settings persist to RAMSettings.ini

Dialogs:
- [~] Account Utilities (password, email, display name, privacy, block/unblock, PIN, outfits, universe)
- [~] Account Fields editor
- [~] Import (cookies, user:pass, drag and drop)
- [~] Theme Editor (all colors, toggles, live preview)
- [ ] Server List (servers, games, favorites, recent, player finder, region info)
- [~] Arguments form
- [~] Missing Assets dialog

Platform:
- [~] Multi-Roblox (Windows)
- [~] Roblox launching with auth tickets + launchData
- [~] BrowserTrackerID tracking
- [~] FPS Unlocker
- [ ] Roblox Watcher (disconnect detection, memory, window title, auto-relaunch)
- [~] Window position memory per account

Backend:
- [~] Local Web Server with ALL endpoints
- [~] Nexus WebSocket with ALL commands
- [~] Auto cookie refresh
- [~] Image batch caching

App Lifecycle:
- [ ] Auto-updater
- [~] Single instance enforcement
- [~] Start on PC startup
- [~] Window state persistence
- [ ] App icon

Also check:
- [ ] Error handling on all API calls (Roblox down)
- [ ] Rate limiting handling (API 429 behavior)
- [~] Empty states (no accounts, no servers found, etc.)
- [~] Loading states (spinners/skeletons while data loads)
- [ ] 100+ accounts performance test
- [~] Encrypted AccountData.json migration from legacy app

---

### Missing/Partial Items Remaining After Code Pass
- Server List: dedicated "Player Finder" flow is not present yet in current server-list UI.
- Watcher parity gap: no proven auto-relaunch pipeline after watcher-triggered process kill.
- Auto-updater release flow is not production-ready until signing key + update artifacts are configured and tested.
- App icon parity: still uses placeholder icon assets from earlier scaffold step.
- Rate limit handling is mostly generic error propagation; no robust per-endpoint retry/backoff strategy.
- Global error-path UX is inconsistent across API calls (some paths toast, some silent catch).
- No validated 100+ account performance benchmark run has been executed in this session.
- Legacy encrypted data migration path added in code, but needs verification against real legacy AccountData files.

**Blockers for final Step 17 completion:**
- Requires manual side-by-side runtime verification with original app for visual and behavior parity.
- Requires live Roblox/API/network scenarios (down/429/disconnect) and larger account datasets to fully close remaining checklist items.
