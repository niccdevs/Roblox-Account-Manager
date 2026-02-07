import type { UseSettingsReturn } from "../../hooks/useSettings";
import { Toggle } from "../ui/Toggle";
import { NumberField } from "../ui/NumberField";
import { TextField } from "../ui/TextField";
import { Divider } from "../ui/Divider";
import { SectionLabel } from "../ui/SectionLabel";

export function MiscellaneousTab({ s }: { s: UseSettingsReturn }) {
  const customClientSettings = s.get("General", "CustomClientSettings", "").trim();
  const customClientSettingsEnabled = customClientSettings.length > 0;

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
