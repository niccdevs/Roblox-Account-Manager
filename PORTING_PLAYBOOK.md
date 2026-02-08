# RAM Porting Playbook

Step-by-step prompts for porting RAM to Tauri. Each step is one conversation session. Start a new conversation for each step so context stays clean.

**Before every session:** Make sure CLAUDE.md, PORTING_STRATEGY.md, PORTING_LOG.md, and this file are in the project root.

**After every step:** Verify the output works before moving to the next step. Don't skip ahead.

---

## Branch Strategy

All v4 work happens on a branch called `v4` in the same repository (fork of ic3w0lf22's original). The master branch stays untouched with the current C# release.

**Do NOT merge v4 into master until v4 is a stable beta.**

The v4 branch contains:
```
_legacy/                    ← Full copy of the old C# codebase (read-only reference, in .gitignore)
  RBX Alt Manager/
    Classes/
      Account.cs
      Cryptography.cs
      Utilities.cs
      WebServer.cs
      RobloxProcess.cs
      IniFile.cs
      ...
    Forms/
      SettingsForm.cs
      ServerList.cs
      ImportForm.cs
      ThemeEditor.cs
      ...
    Nexus/
      WebsocketServer.cs
      Command.cs
      ControlledAccount.cs
      ...
    AccountManager.cs
    AccountManager.Designer.cs
  Launcher/
  packages/
  RAMAccount.lua
  RBX Alt Manager.sln

src/                        ← New TypeScript frontend
src-tauri/                  ← New Rust backend
package.json
CLAUDE.md
PORTING_STRATEGY.md
PORTING_PLAYBOOK.md
PORTING_LOG.md
```

The `_legacy/` folder is in .gitignore (never committed). It is purely for AI reference. The AI reads original C# files from it using the Read tool.

---

## Step 0: Branch and Legacy Setup — DONE

Do this yourself (not AI):
1. Create the branch: `git checkout -b v4`
2. Copy the entire `RBX Alt Manager/` directory, `Launcher/`, `packages/`, `RAMAccount.lua`, and `RBX Alt Manager.sln` into `_legacy/`
3. Delete everything else from the branch root except: `CLAUDE.md`, `PORTING_STRATEGY.md`, `PORTING_PLAYBOOK.md`, `PORTING_LOG.md`, `Images/`, `README.md`, `.gitignore`
4. Add `_legacy/` to `.gitignore`
5. Update CLAUDE.md: remove C#/WinForms build instructions, add Tauri/Rust/TS context, keep all important rules
6. Commit and push to fork

### Dev environment prerequisites
Make sure these are installed before Step 1:
- [Rust](https://rustup.rs/) (stable toolchain)
- [Bun](https://bun.sh/) (latest version) — used instead of Node.js for faster installs, builds, and runtime
- [Tauri CLI](https://tauri.app/start/) (`cargo install tauri-cli`)
- WebView2 (Windows 10 users, Win11 has it already)

---

## Step 1: Tauri Project Scaffold — DONE

**Prompt:**
```
Read PORTING_STRATEGY.md, PORTING_PLAYBOOK.md, and PORTING_LOG.md first.

We are on the v4 branch. The old C# code is in _legacy/ for reference.

Initialize a Tauri v2 project in the repo root with:
- TypeScript frontend using React + Vite
- Tailwind CSS v4
- Bun as the package manager
- The Rust backend with this module structure:

  src-tauri/src/
  ├── main.rs
  ├── lib.rs
  ├── platform/
  │   ├── mod.rs
  │   ├── windows.rs
  │   └── macos.rs
  ├── api/
  │   ├── mod.rs
  │   ├── auth.rs
  │   └── roblox.rs
  ├── data/
  │   ├── mod.rs
  │   ├── accounts.rs
  │   ├── settings.rs
  │   └── crypto.rs
  └── nexus/
      ├── mod.rs
      └── websocket.rs

All modules should have the basic structure but can be stubs for now. Just get it compiling and opening a blank window.

Don't forget to update PORTING_LOG.md when done.
```

**Verify:** `cargo tauri dev` opens an empty window with no errors.

---

## Step 2: Account Data Model — DONE

**Prompt:**
```
Read PORTING_STRATEGY.md, PORTING_LOG.md, and the playbook first.

We are on the v4 branch. Read the original C# Account model:
- _legacy/RBX Alt Manager/Classes/Account.cs

Port the Account data model to Rust in src-tauri/src/data/accounts.rs:
- Create the Account struct with ALL fields from the C# version. Don't skip any.
- Implement serde Serialize/Deserialize
- The JSON format MUST match the existing AccountData.json exactly so users can migrate their data
- Implement load/save for AccountData.json
- Create Tauri IPC commands: get_accounts, save_accounts, add_account, remove_account
- Wire the commands up in lib.rs

Do NOT port encryption yet. Handle unencrypted accounts only for now.

Update PORTING_LOG.md when done.
```

**Verify:** Create a test AccountData.json with a couple accounts, call get_accounts from the frontend console, see the data come back.

---

## Step 3: Encryption Compatibility — DONE

**Prompt:**
```
Read PORTING_STRATEGY.md and PORTING_LOG.md first.

Read the original encryption code:
- _legacy/RBX Alt Manager/Classes/Cryptography.cs

Also check how encryption is called in:
- _legacy/RBX Alt Manager/Classes/Account.cs (search for encrypt/decrypt calls)

Port encryption to Rust in src-tauri/src/data/crypto.rs:
- MUST use the exact same algorithm and key derivation as the C# libsodium version
- MUST decrypt existing encrypted AccountData.json files without data loss
- Look at what libsodium functions the C# code calls (SecretBox? SealedPublicKeyBox? PasswordHash?) and use the equivalent Rust crate (sodiumoxide or libsodium-sys)
- Integrate with the accounts module so encrypted files load transparently

This is a migration-critical step. If the crypto doesn't match byte-for-byte, users lose their accounts. Be extremely careful.

Update PORTING_LOG.md when done.
```

**Verify:** Take a real encrypted AccountData.json from the current app, load it with the new Rust code, confirm all accounts decrypt correctly.

---

## Step 4: Settings and Config — DONE

**Prompt:**
```
Read PORTING_STRATEGY.md and PORTING_LOG.md first.

Read the original settings code:
- _legacy/RBX Alt Manager/Classes/IniFile.cs
- _legacy/RBX Alt Manager/Forms/SettingsForm.cs (to understand all settings options)
- Also search _legacy/RBX Alt Manager/AccountManager.cs for "RAMSettings" to see how settings are loaded and used

Port settings to Rust in src-tauri/src/data/settings.rs:
- Parse RAMSettings.ini and RAMTheme.ini using the same INI format
- Expose all settings via Tauri commands (get_settings, update_setting, get_theme)
- Keep backwards compatibility so existing INI files work

Update PORTING_LOG.md when done.
```

**Verify:** Existing RAMSettings.ini and RAMTheme.ini load correctly through Tauri commands.

---

## Step 5: Authentication — DONE

**Prompt:**
```
Read PORTING_STRATEGY.md and PORTING_LOG.md first. The auth section in the strategy doc is critical.

Read the original auth code carefully:
- _legacy/RBX Alt Manager/Classes/Account.cs

Look for these specific things:
- How CSRF tokens are obtained (the x-csrf-token header MUST be lowercase)
- How .ROBLOSECURITY cookies are stored and sent
- How cookies are validated and refreshed
- How auth tickets are generated (especially the launchData parameter)
- All HTTP headers, cookie handling, error retry logic

Port to Rust in src-tauri/src/api/auth.rs using reqwest:
- Port every auth method exactly as the C# does it
- Same headers, same cookie handling, same error handling
- Do NOT simplify, clean up, or "improve" any of it. Match the behavior exactly.
- Create Tauri commands: validate_cookie, get_csrf_token, get_auth_ticket

This is the most important code in the app. If auth breaks, nothing works.

Update PORTING_LOG.md when done.
```

**Verify:** Use a real .ROBLOSECURITY cookie, validate it, get a CSRF token, generate an auth ticket. All three must work.

---

## Step 6: Roblox API Clients (Full)

This step covers EVERY Roblox API endpoint used in the original app. Nothing should be left for later.

**Prompt:**
```
Read PORTING_STRATEGY.md and PORTING_LOG.md first.

Read the original API code thoroughly:
- _legacy/RBX Alt Manager/Classes/Account.cs (search for RestClient, RestRequest, every HTTP call)
- _legacy/RBX Alt Manager/AccountManager.cs (search for MainClient, AvatarClient, FriendsClient, UsersClient, EconClient, GameJoinClient and ALL API calls)
- _legacy/RBX Alt Manager/Forms/AccountUtils.cs (account utility API calls)
- _legacy/RBX Alt Manager/Forms/ServerList.cs (game/server API calls)

Port ALL Roblox API calls to Rust in src-tauri/src/api/roblox.rs. Here is the complete list — do not skip any:

Friends:
- Send friend request (POST friends.roblox.com/v1/users/{id}/request-friendship)
- Get friend list
- Get friend requests (pending)

Avatar:
- Get avatar info (avatar.roblox.com/v1/avatar)
- Get outfits (avatar.roblox.com/v2/avatar/outfits)
- Set player avatar type (avatar.roblox.com/v1/avatar/set-player-avatar-type)
- Set scales (avatar.roblox.com/v1/avatar/set-scales)
- Set body colors (avatar.roblox.com/v1/avatar/set-body-colors)
- Set wearing assets (avatar.roblox.com/v2/avatar/set-wearing-assets)

Users:
- Get user info (users.roblox.com/v1/users/{id})
- Lookup by username (users.roblox.com/v1/usernames/users)
- Get robux balance (www.roblox.com/mobileapi/userinfo)

Games:
- Get game/place details (games.roblox.com/v1/games/multiget-place-details)
- Get server list for a game (games.roblox.com/v1/games/{universeId}/servers/0)
- Join game instance (gamejoin.roblox.com/v1/join-game-instance)
- Follow user into game (gamejoin.roblox.com/v1/join-game-instance with follow)
- Parse VIP server links and access codes from game pages (www.roblox.com/games/{placeId} and web.roblox.com fallback)

Privacy & Account Settings:
- Get/set follow me privacy (www.roblox.com/account/settings/follow-me-privacy)
- Get/set private server invite privacy (www.roblox.com/account/settings/private-server-invite-privacy)
- Block user (accountsettings.roblox.com/v1/users/{id}/block)
- Unblock user (accountsettings.roblox.com/v1/users/{id}/unblock)
- Get blocked users list (accountsettings.roblox.com/v1/users/get-detailed-blocked-users)
- Unblock everyone (loop through blocked list, retry logic)

Groups:
- Join group

Presence:
- Get presence for user(s) (presence.roblox.com/v1/presence/users)

Quick Login:
- Enter code (apis.roblox.com/auth-token-service/v1/login/enterCode)
- Validate code (apis.roblox.com/auth-token-service/v1/login/validateCode)

Thumbnails (needed for Step 7):
- Batch thumbnails (thumbnails.roblox.com/v1/batch)
- Asset thumbnails fallback (thumbnails.roblox.com/v1/assets)

Keep the subdomain separation (friends.roblox.com, avatar.roblox.com, etc).
Expose each as a Tauri command.

Update PORTING_LOG.md when done.
```

**Verify:** Can fetch a real user's friends, avatar, game servers, blocked list. Can send a Quick Login code. Thumbnails return image URLs.

---

## Step 7: Image & Thumbnail Batch System

The original app has a sophisticated batch image loading system (Batch.cs) that combines many thumbnail requests into single API calls. This is needed before the frontend, otherwise the account list will be slow.

**Prompt:**
```
Read PORTING_STRATEGY.md and PORTING_LOG.md first.

Read the original batch/image code:
- _legacy/RBX Alt Manager/Classes/Batch.cs (the batch request system)
- _legacy/RBX Alt Manager/Classes/Avatar.cs (avatar image handling)
- _legacy/RBX Alt Manager/Classes/AccountRenderer.cs (how images are displayed per account)
- _legacy/RBX Alt Manager/AccountManager.cs (search for "Batch", "thumbnail", "headshot", "avatar" to see how images are loaded)

Port the image/thumbnail batch system to Rust:
- Batch API: Combines multiple thumbnail requests (up to 100) into a single POST to thumbnails.roblox.com/v1/batch
- Request types: AvatarHeadShot (for account list), GameIcon (for server list/recent games), Asset (for outfits)
- Batch window: Collects requests for ~50ms then fires them together (the C# uses a timer-based queue)
- Image caching: Cache fetched image URLs to avoid redundant API calls
- Fallback: If batch fails, fall back to individual thumbnails.roblox.com/v1/assets requests

Create Tauri commands:
- get_avatar_headshot(user_id) — returns image URL (may queue and batch)
- get_avatar_headshots(user_ids) — batch request for multiple users
- get_game_icon(universe_id) — game icon URL
- get_asset_thumbnail(asset_id) — asset image URL
- clear_image_cache() — clear cached URLs

The frontend will call these and display the images. The batching happens transparently on the Rust side.

Update PORTING_LOG.md when done.
```

**Verify:** Request headshots for 20+ accounts, confirm they arrive in 1-2 batched API calls instead of 20 individual ones. Check caching prevents duplicate requests.

---

## Step 8: Frontend — Main Account List

This is the primary UI. It needs to look significantly better than the WinForms original while matching all functionality.

**Prompt:**
```
Read PORTING_STRATEGY.md and PORTING_LOG.md first.

Look at the original app's features for reference:
- _legacy/RBX Alt Manager/AccountManager.cs (the UI logic, context menus, account list behavior, every button and action)
- _legacy/RBX Alt Manager/Classes/AccountRenderer.cs (how accounts are rendered — avatar images, colored dots, text layout)
- _legacy/RBX Alt Manager/AccountManager.Designer.cs (UI layout, control names, event bindings)
- Images/ folder in the repo for screenshots of the current app

Build the main UI in React + Tailwind. This is NOT a 1:1 copy of the WinForms layout. Make it modern, dark, polished.

Account list/table:
- Each row shows: avatar headshot image, alias (or username if no alias), username, description, group, last used timestamp
- Freshness indicator: colored dot (green→yellow→red based on days since last use, matching the original's 20-day threshold)
- Avatar images loaded via the batch thumbnail system from Step 7
- Single-click to select, Ctrl+click for multi-select, Shift+click for range select
- Drag and drop to reorder accounts within and between groups
- Account groups with collapsible headers (group name + account count)
- Group sorting by numeric prefix (e.g. "1Main", "007 Bank" → sorted by number, number hidden in display)
- "Hide Usernames" toggle checkbox

Right-click context menu (ALL of these, matching the original):
- Set Alias
- Set Description
- Copy Cookie (.ROBLOSECURITY)
- Copy Username
- Copy Password
- Copy User:Pass Combo
- Copy User ID
- Copy Profile Link
- Copy rbx-player Link
- Copy App Link
- Get Authentication Ticket (dev mode only)
- View/Edit Fields (opens field editor)
- Remove Account
- Move to Group → [list of existing groups + "New Group"]
- Copy Group (copy all accounts in same group)
- Sort Alphabetically
- Toggle (show/hide group)
- Show Details (popup with account info)
- Quick Login (6-digit code flow)

Top bar / navigation:
- PlaceId input field
- JobId input field
- Launch Data input field
- Join Server button
- Server List button
- Save PlaceId/JobId button (per account)
- Shuffle JobId toggle button
- Recent Games dropdown/button (clock icon)
- Add Account button (with dropdown arrow for: Add Single, Import Cookies, Import User:Pass)
- Settings button (gear icon)
- Account Utilities button
- Account Control (Nexus) button
- Open Browser button (with dropdown: Open Browser, Join Group)
- Edit Theme button
- Search/filter bar

Status bar or info area:
- Selected account count
- Total account count

Auto cookie refresh:
- Background timer that periodically refreshes cookies for all accounts (matching the original's interval)
- Uses the refresh_cookie Tauri command from Step 5

Wire everything to existing Tauri commands from Steps 2-7.

Update PORTING_LOG.md when done.
```

**Verify:** Real accounts display with avatar images, groups work, context menu has all options, search filters correctly, drag and drop reorders.

---

## Step 9: Frontend — Settings Dialog

The settings dialog has multiple tabs with many options. Every single setting from the original must be present.

**Prompt:**
```
Read PORTING_STRATEGY.md and PORTING_LOG.md first.

Read the original settings form:
- _legacy/RBX Alt Manager/Forms/SettingsForm.cs
- _legacy/RBX Alt Manager/Forms/SettingsForm.Designer.cs

Build the settings dialog as a modal/overlay in React. It must have these tabs matching the original:

General tab:
- Check for Updates (checkbox)
- Async Join (checkbox)
- Account Join Delay (number input, decimal)
- Save Passwords (checkbox)
- Disable Aging Alert (checkbox)
- Hide Multi-Roblox notification (checkbox)
- Disable Images (checkbox)
- Shuffle Chooses Lowest Server (checkbox)
- Enable Multi Roblox (checkbox, with warning about risk)
- Show Presence (checkbox)
- Auto Cookie Refresh (checkbox)
- Start on PC Startup (checkbox)
- Max Recent Games (number input)

Developer tab:
- Enable Developer Mode (checkbox)
- Enable Web Server (checkbox)

WebServer tab (only visible when dev mode on):
- Every Request Requires Password (checkbox)
- Allow Get Cookie (checkbox)
- Allow Get Accounts (checkbox)
- Allow Launch Account (checkbox)
- Allow Account Editing (checkbox)
- Allow External Connections (checkbox)
- Password (text input)
- Web Server Port (number input)

Watcher tab:
- Exit If No Connection (checkbox)
- No Connection Timeout (number input, seconds)
- Exit on Beta (checkbox)
- Verify Data Model (checkbox)
- Ignore Existing Processes (checkbox)
- Close If Memory Low (checkbox)
- Memory Low Value (number input, MB)
- Close If Window Title (checkbox)
- Expected Window Title (text input)
- Remember Window Positions (checkbox)

Miscellaneous tab:
- Unlock FPS (checkbox)
- Max FPS Value (number input)
- Shuffle Job ID (checkbox)
- Shuffle Page Count (number input)
- Auto Close Last Process (checkbox)

All settings read from and write to RAMSettings.ini via the Tauri commands from Step 4.

Update PORTING_LOG.md when done.
```

**Verify:** Every setting loads from existing RAMSettings.ini, can be changed, saves correctly, reloads with saved values.

---

## Step 10: Frontend — Server List & Game Browser

**Prompt:**
```
Read PORTING_STRATEGY.md and PORTING_LOG.md first.

Read the original server list form:
- _legacy/RBX Alt Manager/Forms/ServerList.cs
- _legacy/RBX Alt Manager/Forms/ServerList.Designer.cs
- _legacy/RBX Alt Manager/Classes/GameInstance.cs
- _legacy/RBX Alt Manager/Classes/GameInstancesCollection.cs
- _legacy/RBX Alt Manager/Classes/GamePlayer.cs
- _legacy/RBX Alt Manager/Classes/Server.cs
- _legacy/RBX Alt Manager/Classes/GameClass.cs

Build the Server List screen:

Server browser:
- PlaceId input at top
- Refresh button to load servers
- Server list showing: server index, player count / max players, ping, average FPS
- Right-click server: Join Game, Load Region
- Region info display (country, city, ping) when "Load Region" is clicked
- Second PlaceId input for "Join Small Servers" feature (for lobby→teleport games)

Game discovery tabs:
- Games tab: Browse popular/trending games
- Favorites tab: User's favorited games list
- Recent tab: Recently joined games (stored locally, configurable max count)

Player finder:
- Username input field
- Search button that scans servers for a specific player
- Progress indicator (this can take a while)

Game icons loaded via the batch thumbnail system from Step 7.

Each game entry shows: game icon, game name, player count, like ratio.
Clicking a game fills in the PlaceId and loads servers.

Update PORTING_LOG.md when done.
```

**Verify:** Can browse servers for a real game, see player counts, load region info. Recent games persist between sessions. Player finder locates a known player.

---

## Step 11: Frontend — Account Utility Dialogs

These are all the smaller dialogs and forms. Each one must match the original's functionality.

**Prompt:**
```
Read PORTING_STRATEGY.md and PORTING_LOG.md first.

Read all original dialog forms:
- _legacy/RBX Alt Manager/Forms/AccountUtils.cs (and .Designer.cs)
- _legacy/RBX Alt Manager/Forms/AccountFields.cs (and .Designer.cs)
- _legacy/RBX Alt Manager/Forms/ImportForm.cs (and .Designer.cs)
- _legacy/RBX Alt Manager/Forms/ThemeEditor.cs (and .Designer.cs)
- _legacy/RBX Alt Manager/Forms/ArgumentsForm.cs (and .Designer.cs)
- _legacy/RBX Alt Manager/Forms/RecentGamesForm.cs (and .Designer.cs)
- _legacy/RBX Alt Manager/Forms/MissingAssets.cs (and .Designer.cs)
- _legacy/RBX Alt Manager/Forms/Updater.cs (and .Designer.cs)

Build ALL of these dialogs:

1. Account Utilities dialog:
   - Shows account info (username, display name, user ID, robux balance, email, PIN status)
   - Change Password (current + new password fields, calls change_password API, updates stored cookie)
   - Change Email (password + new email fields)
   - Change Display Name
   - Follow Privacy dropdown (Everyone, Followers, Following, Friends, No One)
   - Private Server Invite Privacy dropdown
   - Block/Unblock Users section (text input for username, block/unblock buttons)
   - View Blocked Users list with "Unblock All" button (with confirmation)
   - PIN unlock (4-digit input, unlock button)
   - Outfit viewer: Show other player's outfits, "Wear Outfit" button to copy their outfit to your account
   - Universe viewer: Shows universe details for a game

2. Account Fields dialog:
   - Shows all custom key-value fields for the selected account
   - Add new field (key + value inputs)
   - Edit existing field value
   - Delete field
   - Fields persist in AccountData.json (already in the Account struct from Step 2)

3. Import dialog:
   - Tab 1: Import by Cookie — paste one or more .ROBLOSECURITY cookies (one per line)
   - Tab 2: Import by User:Pass — paste username:password combos (one per line)
   - Drag and drop support: Drop cookies directly onto the main window OR import dialog
   - Progress indicator for batch imports
   - Validation: Each imported cookie is validated against the Roblox API
   - Duplicate detection: Skip accounts already in the list (match by user ID)

4. Theme Editor dialog:
   - Color pickers for every theme property:
     - AccountsBG, AccountsFG (account list colors)
     - ButtonsBG, ButtonsFG, ButtonsBC (button colors + border)
     - FormsBG, FormsFG (form/window colors)
     - TextBoxesBG, TextBoxesFG, TextBoxesBC (input colors + border)
     - LabelsBC, LabelsFC (label border + foreground)
   - Checkbox toggles:
     - LabelsTransparent
     - DarkTopBar
     - ShowHeaders (column headers in account list)
     - LightImages (use light icon variants)
   - ButtonStyle dropdown (Flat, Popup, Standard)
   - Live preview: Changes apply in real-time as you pick colors
   - Save/Reset buttons
   - All values save to RAMTheme.ini

5. Arguments Form:
   - Custom command-line arguments to pass when launching Roblox
   - Text input for additional arguments
   - Save per-account or global

6. Missing Assets dialog:
   - Shows when setting an avatar fails due to invalid/missing asset IDs
   - Lists each missing asset ID
   - Appears automatically after failed avatar wear operation

Same dark modern style throughout. All wired to Tauri commands.

Update PORTING_LOG.md when done.
```

**Verify:** Can import accounts by cookie and user:pass. Can edit custom fields. Theme editor changes colors in real-time. Account utilities can change password and show blocked users.

---

## Step 12: Browser-Based Account Login

The original app uses CefSharp (embedded Chromium) to let users log into Roblox in a browser window, then extracts the .ROBLOSECURITY cookie. This is how most users add accounts.

**Prompt:**
```
Read PORTING_STRATEGY.md and PORTING_LOG.md first.

Read the original browser code:
- _legacy/RBX Alt Manager/Classes/AccountBrowser.cs
- _legacy/RBX Alt Manager/AccountManager.cs (search for "Browser", "CefSharp", "OpenBrowser")

The original app embeds a full Chromium browser (CefSharp) for two purposes:
1. "Add Account" via browser login: User logs into roblox.com, app extracts .ROBLOSECURITY cookie
2. "Open Browser" for existing account: Opens a browser window already logged in as that account

Port this using Tauri's WebviewWindow API:
- Create a new Tauri webview window that loads roblox.com/login
- After the user logs in, extract the .ROBLOSECURITY cookie from the webview
- Use that cookie to add the account to AccountData.json (validate it first via the auth API)
- For "Open Browser" on existing accounts: Create a webview window, inject the account's .ROBLOSECURITY cookie, then navigate to roblox.com

Implementation details:
- Use tauri::WebviewWindowBuilder to create secondary windows
- Use the webview's cookie API or JavaScript execution to read/set cookies
- Close the browser window automatically after successful cookie extraction (or let user close it)
- Handle edge cases: user closes window without logging in, login fails, cookie already expired

Tauri commands:
- open_login_browser() — opens a new webview window for login, returns extracted cookie on success
- open_account_browser(user_id) — opens a browser logged in as the specified account

This replaces CefSharp entirely. No external browser dependencies needed.

Update PORTING_LOG.md when done.
```

**Verify:** Can open browser, log into Roblox, account gets added automatically. Can open browser as existing account and browse roblox.com logged in.

---

## Step 13: Windows Platform — Multi-Roblox, Launching, Watcher

This is the biggest platform-specific step. Covers everything related to Roblox process management on Windows.

**Prompt:**
```
Read PORTING_STRATEGY.md and PORTING_LOG.md first.

Read ALL original process management code carefully:
- _legacy/RBX Alt Manager/Classes/RobloxProcess.cs (full file — process tracking, log parsing, connection detection)
- _legacy/RBX Alt Manager/Classes/RobloxWatcher.cs (watcher timer, auto-relaunch, memory monitoring)
- _legacy/RBX Alt Manager/Classes/ClientSettingsPatcher.cs (FPS unlocker, ClientAppSettings.json)
- _legacy/RBX Alt Manager/AccountManager.cs (search for: "LaunchAccount", "JoinServer", "PlaceId", "JobId", "LaunchData", "mutex", "BrowserTracker", "RobloxProcess", "StartRoblox")

Port Windows platform code to Rust in src-tauri/src/platform/windows.rs.
Use #[cfg(target_os = "windows")] for all Windows-specific code.
Use the windows-sys crate for Win32 API calls.

Multi-Roblox:
- Roblox singleton mutex detection: Find and list Roblox mutexes by name
- Mutex killing: OpenMutex + CloseHandle to allow multiple instances
- This must be opt-in (controlled by EnableMultiRbx setting)

Roblox Launching:
- Build the roblox-player:// protocol URL with auth ticket, PlaceId, JobId, LaunchData
- OR use direct exe launch with command-line arguments (check which the C# uses)
- BrowserTrackerID: Assign unique tracker per account, prevent duplicate instances of same account
- Auto-close: If same account is already running, close the old instance before launching
- Queue-based multi-account launching with configurable delay between launches (AccountJoinDelay setting)
- VIP server link parsing: Extract access code from VIP server URLs
- Shuffle JobId: When enabled, pick a random server from the server list before joining
- Follow User: Join the same server as another user

Roblox Watcher:
- Detect running Roblox processes and associate them with accounts (via BrowserTrackerID)
- Monitor Roblox log files for connection status (the C# parses log files with regex patterns)
- Auto-relaunch: If account disconnects and auto-relaunch is enabled, relaunch after timeout
- Connection loss detection: Parse log for disconnect events, configurable timeout (NoConnectionTimeout)
- Memory monitoring: Check process memory usage, kill if below threshold (MemoryLowValue)
- Window title monitoring: Kill if window title doesn't match expected (ExpectedWindowTitle)
- DataModel verification: Detect if Roblox is stuck on loading screen or beta home menu
- Ignore existing processes option: Don't monitor Roblox instances that were running before RAM started

FPS Unlocker:
- Modify ClientAppSettings.json in Roblox's installation directory
- Set DFIntTaskSchedulerTargetFps to the configured MaxFPSValue
- Apply on launch, restore on exit (or leave modified based on setting)
- Find Roblox installation path from registry or known default paths

Process Detection:
- Find Roblox installation path (registry: HKCU\SOFTWARE\Roblox\RobloxStudioBrowser, or default paths)
- Detect if Roblox is installed
- Get list of running Roblox processes with PIDs

Window Position Memory:
- Save window position per account (in account Fields)
- Restore window position when relaunching same account

Tauri commands:
- launch_roblox(user_id, place_id, job_id, launch_data) — full launch flow
- launch_multiple(user_ids, place_id, job_id, launch_data) — queue-based multi-launch
- kill_roblox(user_id) — kill specific account's Roblox instance
- kill_all_roblox() — kill all Roblox instances
- get_running_instances() — list of running Roblox processes with account mapping
- enable_multi_roblox() — kill singleton mutex
- get_roblox_path() — find Roblox installation
- start_watcher() / stop_watcher() — toggle process watcher
- apply_fps_unlock(max_fps) — modify ClientAppSettings.json

Update PORTING_LOG.md when done.
```

**Verify:** Can launch Roblox with an auth ticket. Can launch multiple instances with different accounts. Watcher detects when an instance disconnects. FPS unlocker modifies the settings file.

---

## Step 14: Local Web Server (Developer API)

The original app has a local HTTP API that external tools use. Every endpoint must be preserved for backwards compatibility.

**Prompt:**
```
Read PORTING_STRATEGY.md and PORTING_LOG.md first.

Read the original web server:
- _legacy/RBX Alt Manager/Classes/WebServer.cs (full file, every endpoint)

Port the local HTTP API server to Rust using axum or actix-web.

Every endpoint from the original, with the same URL paths, query parameters, and response format:

Account Management:
- GET /GetAccounts — list accounts (respects password protection)
- GET /GetAccountsJson — same, JSON format
- GET /ImportCookie?cookie=XXX — add account by cookie
- GET /GetCookie?UserId=XXX — get account's .ROBLOSECURITY (requires AllowGetCookie)
- GET /GetCSRFToken?UserId=XXX — get CSRF token for account
- POST /SetAlias?UserId=XXX body=alias — change alias
- POST /SetDescription?UserId=XXX body=desc — change description
- POST /AppendDescription?UserId=XXX body=text — append to description
- GET /GetAlias?UserId=XXX
- GET /GetDescription?UserId=XXX
- GET /GetField?Field=name&UserId=XXX — get custom field
- POST /SetField?Field=name&Value=val&UserId=XXX — set custom field
- POST /RemoveField?Field=name&UserId=XXX — delete custom field

Game Actions:
- GET /LaunchAccount?UserId=XXX&PlaceId=XXX&JobId=XXX&LaunchData=XXX — launch Roblox
- GET /FollowUser?UserId=XXX&TargetUserId=XXX — follow user into game
- GET /SetServer?UserId=XXX&PlaceId=XXX&JobId=XXX — set saved server
- GET /SetRecommendedServer?UserId=XXX&PlaceId=XXX — pick a server automatically

User Actions:
- POST /SetAvatar?UserId=XXX (JSON body) — set avatar
- POST /BlockUser?UserId=XXX&TargetUserId=YYY
- POST /UnblockUser?UserId=XXX&TargetUserId=YYY
- GET /GetBlockedList?UserId=XXX
- POST /UnblockEveryone?UserId=XXX

Security:
- Password protection per request (EveryRequestRequiresPassword setting)
- Per-endpoint permission flags (AllowGetCookie, AllowGetAccounts, AllowLaunchAccount, AllowAccountEditing)
- AllowExternalConnections: If false, only accept from localhost
- Configurable port (WebServerPort setting, default 8080)

The server runs as a background task alongside the Tauri app.
Only starts if EnableWebServer is true in settings.

Tauri commands:
- start_web_server() / stop_web_server()
- get_web_server_status() — running, port, etc.

Update PORTING_LOG.md when done.
```

**Verify:** Make the same HTTP requests from the original API docs. Compare response format with the original. Test password protection and permission flags.

---

## Step 15: Nexus / Account Control

The Nexus system allows controlling Roblox accounts remotely via a WebSocket connection from within Roblox (using Nexus.lua).

**Prompt:**
```
Read PORTING_STRATEGY.md and PORTING_LOG.md first.

Read ALL Nexus code:
- _legacy/RBX Alt Manager/Nexus/WebsocketServer.cs (WebSocket server implementation)
- _legacy/RBX Alt Manager/Nexus/Command.cs (command definitions — buttons, textboxes, labels, numeric inputs)
- _legacy/RBX Alt Manager/Nexus/ControlledAccount.cs (per-account connection state)
- _legacy/RBX Alt Manager/Nexus/AccountControl.cs (the UI form for account control)
- _legacy/RBX Alt Manager/Nexus/AccountControl.Designer.cs (UI layout)
- _legacy/RBX Alt Manager/Nexus/AccountStatus.cs (status enum/tracking)
- _legacy/Nexus/NexusDocs.md (if it exists, protocol documentation)
- _legacy/RAMAccount.lua (the Lua script that runs inside Roblox clients)

Port the full Nexus system:

WebSocket Server (Rust, tokio-tungstenite):
- Runs on configurable port
- Accepts connections from Roblox clients running Nexus.lua
- Protocol: JSON messages matching the original exactly (the Lua script must work without modification)
- Connection tracking: Map each connection to an account by BrowserTrackerID
- Command sending: Server→Client commands for executing Lua code
- Status receiving: Client→Server status updates (connected, in-game, game name, etc.)
- Heartbeat/keepalive for connection health

Command System:
- Command types: Button, TextBox, NumericInput, Label
- Each command has: Name, Type, Callback
- Commands are defined by the user or by RAM's default set
- Commands generate corresponding UI elements in the Account Control panel

Account Control UI (React frontend):
- List of connected accounts with status indicators (connected, in-game, disconnected)
- Game name and PlaceId for each connected account
- Command panel: Dynamic UI generated from Command definitions
  - Buttons that send Lua code to specific accounts
  - Text inputs for parameterized commands
  - Numeric inputs for number-based commands
  - Labels for read-only info from the client
- Select which accounts to send commands to (single, multi, all)
- Command output/log area
- Settings: WebSocket port, auto-start, etc.

Also check if the RAMAccount.lua script needs any modifications for v4, or if the WebSocket protocol is identical.

Update PORTING_LOG.md when done.
```

**Verify:** Start the WebSocket server. Connect a Roblox client running Nexus.lua. Send a command, see it execute. Status updates appear in the UI.

---

## Step 16: Auto-Updater & App Lifecycle

**Prompt:**
```
Read PORTING_STRATEGY.md and PORTING_LOG.md first.

Read the original updater:
- _legacy/RBX Alt Manager/Forms/Updater.cs (and .Designer.cs)
- _legacy/RBX Alt Manager/AccountManager.cs (search for "update", "version", "CheckForUpdates")

Implement app lifecycle features:

Auto-Updater (use Tauri's built-in updater plugin):
- Check for updates on startup (if CheckForUpdates setting is enabled)
- Compare current version against latest GitHub release
- Show update available notification with changelog
- Download and install update
- Configure the update endpoint in tauri.conf.json

Single-Instance Enforcement:
- Only one instance of RAM should run at a time
- If user tries to open a second instance, focus the existing window
- Use Tauri's single-instance plugin or implement via OS-level mechanism

Startup Behavior:
- Start on PC Startup option (Windows: registry key HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run)
- Mac: Login Items (or launchd plist)
- Minimize to system tray option
- App icon in taskbar/dock

Window State:
- Remember window size and position between sessions
- Minimize to tray on close (optional setting)

App Icon:
- Replace placeholder icons with real RAM icons (or new v4 icons)
- Window title: "Roblox Account Manager"
- Taskbar icon

Update PORTING_LOG.md when done.
```

**Verify:** App checks for updates on startup. Only one instance can run. Start-on-startup works. Window position remembered.

---

## Step 17: Polish & Feature Parity Check

This is the final QA pass. Nothing should be missing after this step.

**Prompt:**
```
Read PORTING_STRATEGY.md and PORTING_LOG.md first.

This is the final QA pass. Read through the ENTIRE original codebase for anything missed:
- _legacy/RBX Alt Manager/AccountManager.cs (ALL of it — every method, every event handler, every button click)
- Every file in _legacy/RBX Alt Manager/Classes/
- Every file in _legacy/RBX Alt Manager/Forms/
- Every file in _legacy/RBX Alt Manager/Nexus/

Use this checklist. Every item must be present and working:

Context Menu (right-click account):
[ ] Set Alias
[ ] Set Description
[ ] Copy Cookie
[ ] Copy Username
[ ] Copy Password
[ ] Copy User:Pass Combo
[ ] Copy User ID
[ ] Copy Profile Link
[ ] Copy rbx-player Link
[ ] Copy App Link
[ ] Get Authentication Ticket (dev mode)
[ ] View/Edit Fields
[ ] Remove Account
[ ] Move to Group
[ ] Copy Group
[ ] Sort Alphabetically
[ ] Toggle group visibility
[ ] Show Details
[ ] Quick Login

Main Window:
[ ] PlaceId / JobId / LaunchData inputs
[ ] Join Server button
[ ] Server List button
[ ] Save PlaceId/JobId per account
[ ] Shuffle JobId toggle
[ ] Recent Games dropdown
[ ] Add Account (single, cookies, user:pass)
[ ] Add Account via browser login
[ ] Settings
[ ] Account Utilities
[ ] Account Control (Nexus)
[ ] Open Browser (logged in as account)
[ ] Join Group button
[ ] Edit Theme
[ ] Search/filter bar
[ ] Hide Usernames toggle
[ ] Account freshness indicators
[ ] Avatar headshot images
[ ] Drag and drop reorder
[ ] Account groups with collapse

Settings:
[ ] Every setting from the General tab
[ ] Every setting from the Developer tab
[ ] Every setting from the WebServer tab
[ ] Every setting from the Watcher tab
[ ] Every setting from the Miscellaneous tab
[ ] Settings persist to RAMSettings.ini

Dialogs:
[ ] Account Utilities (password, email, display name, privacy, block/unblock, PIN, outfits, universe)
[ ] Account Fields editor
[ ] Import (cookies, user:pass, drag and drop)
[ ] Theme Editor (all colors, toggles, live preview)
[ ] Server List (servers, games, favorites, recent, player finder, region info)
[ ] Arguments form
[ ] Missing Assets dialog

Platform:
[ ] Multi-Roblox (Windows)
[ ] Roblox launching with auth tickets + launchData
[ ] BrowserTrackerID tracking
[ ] FPS Unlocker
[ ] Roblox Watcher (disconnect detection, memory, window title, auto-relaunch)
[ ] Window position memory per account

Backend:
[ ] Local Web Server with ALL endpoints
[ ] Nexus WebSocket with ALL commands
[ ] Auto cookie refresh
[ ] Image batch caching

App Lifecycle:
[ ] Auto-updater
[ ] Single instance enforcement
[ ] Start on PC startup
[ ] Window state persistence
[ ] App icon

Also check:
[ ] Error handling on all API calls (what happens when Roblox is down?)
[ ] Rate limiting handling (what happens when API rate limits hit?)
[ ] Empty states (no accounts, no servers found, etc.)
[ ] Loading states (spinners/skeletons while data loads)
[ ] 100+ accounts performance test
[ ] Encrypted AccountData.json migration from legacy app

List EVERYTHING missing in PORTING_LOG.md, then fix what you can in this session.

Update PORTING_LOG.md when done.
```

**Verify:** Use the app side-by-side with the original. Every single feature from the original should be present and working.

---

## Step 18: Mac Platform (BLOCKED — needs research first)

Someone with a Mac needs to figure out:
1. How does Mac Roblox enforce single-instance? (file locks? launchd? unix sockets?)
2. How does Mac Roblox accept auth tickets? (roblox-player:// URL scheme? command line args?)
3. What does the Roblox.app bundle structure look like?
4. Where does Mac Roblox store its settings/logs?
5. Can you modify FPS settings on Mac? Where is ClientAppSettings.json equivalent?

Write the findings into PORTING_LOG.md under a "Mac Research" section.

**Only then use this prompt:**
```
Read PORTING_STRATEGY.md and PORTING_LOG.md first. Read the Mac Research section carefully.

Implement the Mac platform layer in src-tauri/src/platform/macos.rs:
- Single-instance bypass using the mechanism described in the research
- Roblox launching using the method described in the research
- Process detection and monitoring
- FPS unlocker (if possible on Mac)
- Watcher equivalent (log parsing, disconnect detection)
- Use #[cfg(target_os = "macos")] for all Mac-specific code
- Reuse as much logic as possible from the Windows platform module (abstract shared behavior into platform/mod.rs)

Update PORTING_LOG.md when done.
```

**Verify:** Can launch Roblox on Mac, can launch multiple instances. Watcher detects disconnections.

---

## Tips for Each Session

- Start each conversation fresh (new context)
- Always tell the AI to read PORTING_STRATEGY.md and PORTING_LOG.md first
- The AI reads original C# code from the `_legacy/` folder using the Read tool — no git commands, no pasting needed
- Verify each step works before moving on
- If something breaks, fix it in the same session before starting the next step
- Keep sessions focused on ONE step — don't let scope creep
- If a step is too big for one session, split it and note the split in PORTING_LOG.md
- The AI must update PORTING_LOG.md at the end of every session with what was done, what works, what doesn't, and any decisions made
