# v4 Release Flow

## Trigger

`release-v4.yml` runs on every push to `v4` when one of these changes:
- `src/**`
- `src-tauri/**`
- `package.json`

## Version and channel selection

Priority order:
1. PR labels (if the pushed commit belongs to a PR):
   - `bump:patch` or `bump:minor`
   - `channel:beta` or `channel:stable`
2. Commit message flags for direct pushes:
   - `[bump:patch]` or `[bump:minor]`
   - `[channel:beta]` or `[channel:stable]`
3. Default fallback:
   - `patch + beta`

## Release output

- Tag format: `v4.1.0-beta.3`
- Release title: `Roblox Account Manager v4.1.0-beta.3`
- Assets:
  - `Roblox Account Manager_*_x64-setup.exe`
  - `Roblox Account Manager_*_x64_en-US.msi`
  - `roblox-account-manager.exe` (portable)

Release notes explicitly state that only one download is needed.

## Updater channels

Channel manifests are published to branch `update-manifests`:
- `beta/latest.json`
- `stable/latest.json`

Each build rewrites the updater endpoint in `src-tauri/tauri.conf.json` before packaging to:
- `https://raw.githubusercontent.com/<owner>/<repo>/update-manifests/<channel>/latest.json`

## Required secrets

Set these in GitHub repo settings:
- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

Without them, release workflow fails by design.

## Greptile review bot

1. Install the Greptile GitHub App on this repository.
2. Keep `greptile.json` in repo root (already added).
3. Optionally add label `greptile:skip` to skip bot review on specific PRs.

`greptile.json` is applied by Greptile automatically after the app is installed.

## PR helper script

Use:
```powershell
.\scripts\pr-flow.ps1
```

It asks whether to:
1. Push changes to an existing PR branch
2. Push and create a new PR
