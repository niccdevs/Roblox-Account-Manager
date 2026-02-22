import type { UseSettingsReturn } from "../../hooks/useSettings";
import { Toggle } from "../ui/Toggle";
import { NumberField } from "../ui/NumberField";
import { TextField } from "../ui/TextField";
import { Divider } from "../ui/Divider";
import { SectionLabel } from "../ui/SectionLabel";

export function MiscellaneousTab({ s }: { s: UseSettingsReturn }) {
  const customClientSettings = s.get("General", "CustomClientSettings", "").trim();
  const customClientSettingsEnabled = customClientSettings.length > 0;
  const clientVolume = s.getNumber("General", "ClientVolume", 0.5);

  return (
    <div className="space-y-0">
      <SectionLabel>FPS</SectionLabel>
      <Toggle
        checked={s.getBool("General", "UnlockFPS")}
        onChange={(v) => {
          if (customClientSettingsEnabled) return;
          s.setBool("General", "UnlockFPS", v);
        }}
        label="Unlock FPS"
        description={
          customClientSettingsEnabled
            ? "Disabled while Custom ClientAppSettings is set"
            : undefined
        }
      />
      <NumberField
        value={s.getNumber("General", "MaxFPSValue", 120)}
        onChange={(v) => s.setNumber("General", "MaxFPSValue", v)}
        label="Max FPS"
        min={5}
        max={9999}
      />
      <TextField
        value={s.get("General", "CustomClientSettings", "")}
        onChange={(v) => s.set("General", "CustomClientSettings", v)}
        label="Custom ClientSettings"
        placeholder="C:\\path\\ClientAppSettings.json"
      />

      <Divider />
      <SectionLabel>Roblox Client</SectionLabel>

      <Toggle
        checked={s.getBool("General", "OverrideClientVolume")}
        onChange={(v) => s.setBool("General", "OverrideClientVolume", v)}
        label="Override Client Volume"
        description="Apply this volume level before launching Roblox"
      />
      <NumberField
        value={Math.round(clientVolume * 100)}
        onChange={(v) => s.setNumber("General", "ClientVolume", Math.max(0, Math.min(100, v)) / 100)}
        label="Client Volume"
        min={0}
        max={100}
        suffix="%"
      />

      <Toggle
        checked={s.getBool("General", "OverrideClientGraphics")}
        onChange={(v) => s.setBool("General", "OverrideClientGraphics", v)}
        label="Override Graphics Level"
        description="Forces manual graphics quality at launch"
      />
      <NumberField
        value={s.getNumber("General", "ClientGraphicsLevel", 10)}
        onChange={(v) => s.setNumber("General", "ClientGraphicsLevel", v)}
        label="Graphics Level"
        min={1}
        max={10}
      />

      <Toggle
        checked={s.getBool("General", "OverrideClientWindowSize")}
        onChange={(v) => s.setBool("General", "OverrideClientWindowSize", v)}
        label="Override Window Size"
        description="Optional: start Roblox in windowed mode with this size"
      />
      <Toggle
        checked={s.getBool("General", "StartRobloxMinimized")}
        onChange={(v) => s.setBool("General", "StartRobloxMinimized", v)}
        label="Start Roblox Windows Minimized"
        description="Launches Roblox and minimizes the window right after startup"
      />
      <NumberField
        value={s.getNumber("General", "ClientWindowWidth", 1280)}
        onChange={(v) => s.setNumber("General", "ClientWindowWidth", v)}
        label="Window Width"
        min={320}
        max={7680}
      />
      <NumberField
        value={s.getNumber("General", "ClientWindowHeight", 720)}
        onChange={(v) => s.setNumber("General", "ClientWindowHeight", v)}
        label="Window Height"
        min={240}
        max={4320}
      />

      <Divider />
      <SectionLabel>Shuffle</SectionLabel>

      <Toggle
        checked={s.getBool("General", "ShuffleJobId")}
        onChange={(v) => s.setBool("General", "ShuffleJobId", v)}
        label="Shuffle Job ID"
        description="Randomize which server instance to join"
      />
      <NumberField
        value={s.getNumber("General", "ShufflePageCount", 5)}
        onChange={(v) => s.setNumber("General", "ShufflePageCount", v)}
        label="Shuffle Page Count"
        min={1}
        max={100}
      />

      <Divider />
      <SectionLabel>Other</SectionLabel>

      <Toggle
        checked={s.getBool("General", "AutoCloseLastProcess")}
        onChange={(v) => s.setBool("General", "AutoCloseLastProcess", v)}
        label="Auto Close Last Process"
        description="Close the previous Roblox instance when launching a new one for the same account"
      />
      <Toggle
        checked={s.getBool("General", "AutoCloseRobloxForMultiRbx")}
        onChange={(v) => s.setBool("General", "AutoCloseRobloxForMultiRbx", v)}
        label="Auto Close Roblox for Multi Roblox"
        description="If Multi Roblox cannot be enabled, close open Roblox windows automatically and continue"
      />
      <NumberField
        value={s.getNumber("General", "PresenceUpdateRate", 5)}
        onChange={(v) => s.setNumber("General", "PresenceUpdateRate", v)}
        label="Presence Refresh"
        min={1}
        max={9999}
        suffix="min"
      />
    </div>
  );
}
