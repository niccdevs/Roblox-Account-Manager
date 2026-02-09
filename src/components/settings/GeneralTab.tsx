import { enable, disable } from "@tauri-apps/plugin-autostart";
import type { UseSettingsReturn } from "../../hooks/useSettings";
import { Toggle } from "../ui/Toggle";
import { NumberField } from "../ui/NumberField";
import { TextField } from "../ui/TextField";
import { Divider } from "../ui/Divider";
import { SectionLabel } from "../ui/SectionLabel";
import { WarningBadge } from "../ui/WarningBadge";

export function GeneralTab({ s }: { s: UseSettingsReturn }) {
  return (
    <div className="space-y-0">
      <Toggle
        checked={s.getBool("General", "AsyncJoin")}
        onChange={(v) => s.setBool("General", "AsyncJoin", v)}
        label="Async Launching"
        description="Wait for each account to launch before launching the next"
      />
      <NumberField
        value={s.getNumber("General", "AccountJoinDelay", 8)}
        onChange={(v) => s.setNumber("General", "AccountJoinDelay", v)}
        label="Account Join Delay"
        min={0}
        max={60}
        step={0.5}
        suffix="sec"
      />
      <Toggle
        checked={s.getBool("General", "SavePasswords")}
        onChange={(v) => s.setBool("General", "SavePasswords", v)}
        label="Save Passwords"
        description="Store passwords when logging in via user:pass"
      />
      <Toggle
        checked={s.getBool("General", "DisableAgingAlert")}
        onChange={(v) => s.setBool("General", "DisableAgingAlert", v)}
        label="Disable Aging Alert"
        description="Hide the freshness dots on accounts unused for 20+ days"
      />
      <Toggle
        checked={s.getBool("General", "HideRbxAlert")}
        onChange={(v) => s.setBool("General", "HideRbxAlert", v)}
        label="Hide Multi Roblox Alert"
      />
      <Toggle
        checked={s.getBool("General", "DisableImages")}
        onChange={(v) => s.setBool("General", "DisableImages", v)}
        label="Disable Image Loading"
        description="Reduces memory usage by skipping avatar thumbnails"
      />

      <Divider />
      <SectionLabel>Hidden Names</SectionLabel>

      <NumberField
        value={s.getNumber("General", "HiddenNameLetters", 0)}
        onChange={(v) => s.setNumber("General", "HiddenNameLetters", v)}
        label="Preview Letters"
        min={0}
        max={20}
        suffix="chars"
      />
      <Toggle
        checked={s.getBool("General", "ShowAvatarsWhenHidden")}
        onChange={(v) => s.setBool("General", "ShowAvatarsWhenHidden", v)}
        label="Show Avatars When Hidden"
        description="Display profile pictures even when names are hidden"
      />
      <Toggle
        checked={s.getBool("General", "HideRobuxWhenHidden")}
        onChange={(v) => s.setBool("General", "HideRobuxWhenHidden", v)}
        label="Hide Robux When Hidden"
        description="Mask the Robux balance in the sidebar when names are hidden"
      />

      <Divider />

      <Toggle
        checked={s.getBool("General", "ShuffleChoosesLowestServer")}
        onChange={(v) => s.setBool("General", "ShuffleChoosesLowestServer", v)}
        label="Shuffle Chooses Lowest Server"
      />

      <Divider />

      <Toggle
        checked={s.getBool("General", "EnableMultiRbx")}
        onChange={(v) => s.setBool("General", "EnableMultiRbx", v)}
        label={<>Multi Roblox<WarningBadge>use at own risk</WarningBadge></>}
        description="Allow multiple Roblox instances to run simultaneously"
      />
      <Toggle
        checked={s.getBool("General", "ShowPresence")}
        onChange={(v) => s.setBool("General", "ShowPresence", v)}
        label="Show Presence"
        description="Display online status for accounts in the list"
      />
      <Toggle
        checked={s.get("General", "WarnOnOnlineJoin", "true") === "true"}
        onChange={(v) => s.setBool("General", "WarnOnOnlineJoin", v)}
        label="Warn Before Joining Online Accounts"
        description="Show a confirmation if selected accounts are already online/in-game"
      />
      <Toggle
        checked={s.getBool("General", "AutoCookieRefresh")}
        onChange={(v) => s.setBool("General", "AutoCookieRefresh", v)}
        label="Auto Cookie Refresh"
        description="Periodically refresh account cookies to prevent expiration"
      />
      <Toggle
        checked={s.getBool("General", "StartOnPCStartup")}
        onChange={(v) => {
          s.setBool("General", "StartOnPCStartup", v);
          (v ? enable() : disable()).catch(() => {});
        }}
        label="Run on Windows Startup"
      />
      <Toggle
        checked={s.getBool("General", "MinimizeToTray")}
        onChange={(v) => s.setBool("General", "MinimizeToTray", v)}
        label="Minimize to Tray"
        description="Close button hides to system tray instead of exiting"
      />

      <Divider />

      <NumberField
        value={s.getNumber("General", "MaxRecentGames", 8)}
        onChange={(v) => s.setNumber("General", "MaxRecentGames", v)}
        label="Max Recent Games"
        min={1}
        max={30}
      />
      <TextField
        value={s.get("General", "ServerRegionFormat", "<city>, <countryCode>")}
        onChange={(v) => s.set("General", "ServerRegionFormat", v)}
        label="Region Format"
        placeholder="<city>, <countryCode>"
      />
    </div>
  );
}
