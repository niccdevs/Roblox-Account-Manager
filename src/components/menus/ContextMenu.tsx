import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../../store";
import { usePrompt, useConfirm } from "../../hooks/usePrompt";
import { MenuItemView } from "./MenuItemView";
import type { MenuItem } from "./MenuItemView";

export function ContextMenu() {
  const store = useStore();
  const prompt = usePrompt();
  const confirm = useConfirm();
  const ref = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        store.closeContextMenu();
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") store.closeContextMenu();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [store.closeContextMenu]);

  useLayoutEffect(() => {
    if (!store.contextMenu) return;
    const el = ref.current;
    if (!el) return;
    const pad = 8;
    const width = el.offsetWidth || 220;
    const height = el.offsetHeight || 360;
    const left = Math.max(pad, Math.min(store.contextMenu.x, window.innerWidth - width - pad));
    const top = Math.max(pad, Math.min(store.contextMenu.y, window.innerHeight - height - pad));
    setMenuPos({ left, top });
  }, [store.contextMenu]);

  if (!store.contextMenu) return null;

  const accounts = store.selectedAccounts;
  const single = accounts.length === 1 ? accounts[0] : null;
  const userIds = accounts.map((a) => a.UserID);

  async function copyToClipboard(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      store.addToast(`Copied ${label}`);
    } catch {
      store.addToast("Failed to copy");
    }
  }

  function copyMulti(getter: (a: typeof accounts[0]) => string, label: string) {
    const text = accounts.map(getter).join("\n");
    copyToClipboard(text, label);
  }

  const copySubmenu: MenuItem[] = [
    {
      label: "Cookie",
      action: () => copyMulti((a) => a.SecurityToken, "cookie"),
    },
    {
      label: "Username",
      action: () => copyMulti((a) => a.Username, "username"),
    },
    {
      label: "Password",
      action: () => copyMulti((a) => a.Password, "password"),
    },
    {
      label: "User:Pass",
      action: () => copyMulti((a) => `${a.Username}:${a.Password}`, "user:pass"),
    },
    { separator: true, label: "" },
    {
      label: "User ID",
      action: () => copyMulti((a) => String(a.UserID), "user ID"),
    },
    {
      label: "Profile Link",
      action: () =>
        copyMulti(
          (a) => `https://www.roblox.com/users/${a.UserID}/profile`,
          "profile link"
        ),
    },
  ];

  if (store.devMode) {
    copySubmenu.push(
      { separator: true, label: "" },
      {
        label: "rbx-player Link",
        devOnly: true,
        action: async () => {
          if (!single) return;
          try {
            const ticket = await invoke<string>("get_auth_ticket", {
              userId: single.UserID,
            });
            const ts = Date.now();
            const url = `roblox-player://1/1+launchmode:play+gameinfo:${ticket}+launchtime:${ts}+placelauncherurl:https://assetgame.roblox.com/game/PlaceLauncher.ashx?request=RequestGame%26placeId=${store.placeId}+placeId:${store.placeId}`;
            await copyToClipboard(url, "rbx-player link");
          } catch (e) {
            store.addToast(`Error: ${e}`);
          }
        },
      },
      {
        label: "App Link",
        devOnly: true,
        action: async () => {
          if (!single) return;
          try {
            const ticket = await invoke<string>("get_auth_ticket", {
              userId: single.UserID,
            });
            const ts = Date.now();
            const url = `roblox-player://1/1+launchmode:app+gameinfo:${ticket}+launchtime:${ts}+browsertrackerid:${single.BrowserTrackerID || Math.floor(Math.random() * 1e12)}`;
            await copyToClipboard(url, "app link");
          } catch (e) {
            store.addToast(`Error: ${e}`);
          }
        },
      }
    );
  }

  const existingGroups = [...new Set(store.accounts.map((a) => a.Group || "Default"))];
  const moveToGroupSubmenu: MenuItem[] = [
    ...existingGroups.map((g) => ({
      label: g,
      action: () => store.moveToGroup(userIds, g),
    })),
    { separator: true, label: "" },
    {
      label: "New Group...",
      action: async () => {
        const name = await prompt("Group name:");
        if (name?.trim()) store.moveToGroup(userIds, name.trim());
      },
    },
  ];

  const items: MenuItem[] = [
    {
      label: "Set Alias",
      action: async () => {
        const alias = await prompt("Alias:", single?.Alias || "");
        if (alias === null) return;
        for (const a of accounts) {
          store.updateAccount({ ...a, Alias: alias.slice(0, 30) });
        }
        store.addToast("Alias updated");
      },
    },
    {
      label: "Set Description",
      action: async () => {
        const desc = await prompt("Description:", single?.Description || "");
        if (desc === null) return;
        for (const a of accounts) {
          store.updateAccount({ ...a, Description: desc });
        }
        store.addToast("Description updated");
      },
    },
    { separator: true, label: "" },
    { label: "Copy", submenu: copySubmenu },
    { separator: true, label: "" },
  ];

  if (store.devMode) {
    items.push(
      {
        label: "Get Auth Ticket",
        devOnly: true,
        action: async () => {
          if (!single) return;
          try {
            const ticket = await invoke<string>("get_auth_ticket", {
              userId: single.UserID,
            });
            await copyToClipboard(ticket, "auth ticket");
          } catch (e) {
            store.addToast(`Error: ${e}`);
          }
        },
      },
      {
        label: "View/Edit Fields",
        devOnly: true,
        action: () => {
          if (!single) return;
          store.setAccountFieldsOpen(true);
        },
      },
      { separator: true, label: "" }
    );
  }

  items.push(
    {
      label: "Remove Account",
      className: "text-red-400",
      action: async () => {
        const msg =
          accounts.length === 1
            ? `Remove ${single?.Alias || single?.Username}?`
            : `Remove ${accounts.length} accounts?`;
        if (await confirm(msg, true)) {
          store.removeAccounts(userIds);
        }
      },
    },
    { separator: true, label: "" },
    { label: "Move to Group", submenu: moveToGroupSubmenu },
    {
      label: "Copy Group",
      action: () => {
        if (!single) return;
        copyToClipboard(single.Group || "Default", "group");
      },
    },
    {
      label: "Sort Alphabetically",
      action: () => {
        if (!single) return;
        store.sortGroupAlphabetically(single.Group || "Default");
      },
    },
    {
      label: "Toggle Group Visibility",
      action: () => {
        store.setShowGroups(!store.showGroups);
      },
    },
    { separator: true, label: "" },
    {
      label: "Show Details",
      action: () => {
        if (!single) return;
        const details = {
          Username: single.Username,
          UserID: single.UserID,
          Alias: single.Alias,
          Description: single.Description,
          Group: single.Group,
          Valid: single.Valid,
          LastUse: single.LastUse,
          LastAttemptedRefresh: single.LastAttemptedRefresh,
          Fields: single.Fields,
          BrowserTrackerID: single.BrowserTrackerID,
          HasPassword: !!single.Password,
          HasCookie: !!single.SecurityToken,
        };
        store.showModal(
          single.Alias || single.Username,
          JSON.stringify(details, null, 2)
        );
      },
    },
    {
      label: "Quick Login",
      action: async () => {
        if (!single) return;
        let code = "";
        try {
          const clip = await navigator.clipboard.readText();
          if (/^\d{6}$/.test(clip.trim())) code = clip.trim();
        } catch {}
        if (!code) {
          const input = await prompt("Enter 6-digit code:");
          if (!input) return;
          code = input.trim();
        }
        if (!/^\d{6}$/.test(code)) {
          store.addToast("Invalid code (must be 6 digits)");
          return;
        }
        try {
          await invoke("quick_login_enter_code", {
            userId: single.UserID,
            code,
          });
          store.addToast("Quick login code entered");
        } catch (e) {
          store.addToast(`Quick login failed: ${e}`);
        }
      },
    }
  );

  const pos = store.contextMenu;

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[220px] bg-zinc-900/95 backdrop-blur-xl border border-zinc-700/50 rounded-xl shadow-2xl py-1.5 animate-scale-in"
      style={{
        left: menuPos?.left ?? pos.x,
        top: menuPos?.top ?? pos.y,
      }}
    >
      {items
        .filter((item) => !item.devOnly || store.devMode)
        .map((item, i) => (
          <MenuItemView key={i} item={item} close={store.closeContextMenu} />
        ))}
    </div>
  );
}
