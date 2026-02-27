import type { UseSettingsReturn } from "../../hooks/useSettings";
import { Toggle } from "../ui/Toggle";
import { NumberField } from "../ui/NumberField";
import { TextField } from "../ui/TextField";
import { Divider } from "../ui/Divider";
import { SectionLabel } from "../ui/SectionLabel";
import { useTr } from "../../i18n/text";

export function MiscellaneousTab({
  s,
  onRequestEncryptionSetup,
}: {
  s: UseSettingsReturn;
  onRequestEncryptionSetup?: () => void;
}) {
  const t = useTr();
  const customClientSettings = s.get("General", "CustomClientSettings", "").trim();
  const customClientSettingsEnabled = customClientSettings.length > 0;
  const clientVolume = s.getNumber("General", "ClientVolume", 0.5);
  const bottingEnabled = s.getBool("General", "BottingEnabled");
  const bottingUseSharedClientProfile =
    s.get("General", "BottingUseSharedClientProfile", "true") === "true";
  const showRobloxClientSection = !bottingEnabled || bottingUseSharedClientProfile;
  const showSplitBottingProfiles = bottingEnabled && !bottingUseSharedClientProfile;

  const renderBottingClientProfile = (
    title: string,
    prefix: "BottingPlayer" | "BottingBot"
  ) => {
    const customPath = s.get("General", `${prefix}CustomClientSettings`, "");
    const customPathEnabled = customPath.trim().length > 0;
    const profileVolume = s.getNumber("General", `${prefix}ClientVolume`, 0.5);

    return (
      <>
        <SectionLabel>{title}</SectionLabel>
        <Toggle
          checked={s.getBool("General", `${prefix}UnlockFPS`)}
          onChange={(v) => {
            if (customPathEnabled) return;
            s.setBool("General", `${prefix}UnlockFPS`, v);
          }}
          label="Unlock FPS"
          description={
            customPathEnabled
              ? "Disabled while profile Custom ClientAppSettings is set"
              : undefined
          }
        />
        <NumberField
          value={s.getNumber("General", `${prefix}MaxFPSValue`, 120)}
          onChange={(v) => s.setNumber("General", `${prefix}MaxFPSValue`, v)}
          label="Max FPS"
          min={5}
          max={9999}
        />
        <TextField
          value={s.get("General", `${prefix}CustomClientSettings`, "")}
          onChange={(v) => s.set("General", `${prefix}CustomClientSettings`, v)}
          label="Custom ClientSettings"
          placeholder="C:\\path\\ClientAppSettings.json"
        />

        <Toggle
          checked={s.getBool("General", `${prefix}OverrideClientVolume`)}
          onChange={(v) => s.setBool("General", `${prefix}OverrideClientVolume`, v)}
          label="Override Client Volume"
          description="Apply this volume level before launching Roblox"
        />
        <NumberField
          value={Math.round(profileVolume * 100)}
          onChange={(v) =>
            s.setNumber("General", `${prefix}ClientVolume`, Math.max(0, Math.min(100, v)) / 100)
          }
          label="Client Volume"
          min={0}
          max={100}
          suffix="%"
        />

        <Toggle
          checked={s.getBool("General", `${prefix}OverrideClientGraphics`)}
          onChange={(v) => s.setBool("General", `${prefix}OverrideClientGraphics`, v)}
          label="Override Graphics Level"
          description="Forces manual graphics quality at launch"
        />
        <NumberField
          value={s.getNumber("General", `${prefix}ClientGraphicsLevel`, 10)}
          onChange={(v) => s.setNumber("General", `${prefix}ClientGraphicsLevel`, v)}
          label="Graphics Level"
          min={1}
          max={10}
        />

        <Toggle
          checked={s.getBool("General", `${prefix}OverrideClientWindowSize`)}
          onChange={(v) => s.setBool("General", `${prefix}OverrideClientWindowSize`, v)}
          label="Override Window Size"
          description="Optional: start Roblox in windowed mode with this size"
        />
        <Toggle
          checked={s.getBool("General", `${prefix}StartRobloxMinimized`)}
          onChange={(v) => s.setBool("General", `${prefix}StartRobloxMinimized`, v)}
          label="Start Roblox Windows Minimized"
          description="Launches Roblox and minimizes the window right after startup"
        />
        <NumberField
          value={s.getNumber("General", `${prefix}ClientWindowWidth`, 1280)}
          onChange={(v) => s.setNumber("General", `${prefix}ClientWindowWidth`, v)}
          label="Window Width"
          min={320}
          max={7680}
        />
        <NumberField
          value={s.getNumber("General", `${prefix}ClientWindowHeight`, 720)}
          onChange={(v) => s.setNumber("General", `${prefix}ClientWindowHeight`, v)}
          label="Window Height"
          min={240}
          max={4320}
        />
      </>
    );
  };

  return (
    <div className="space-y-0">
      {bottingEnabled && (
        <>
          <Toggle
            checked={bottingUseSharedClientProfile}
            onChange={(v) => s.setBool("General", "BottingUseSharedClientProfile", v)}
            label="Use same client settings for player and bots"
            description="When enabled, botting uses the Roblox Client settings section"
          />
          <Toggle
            checked={s.getBool("General", "BottingAutoShareLaunchFields")}
            onChange={(v) => s.setBool("General", "BottingAutoShareLaunchFields", v)}
            label="Auto-share launch fields with Sidebar"
            description="Keeps Place ID, Job ID, and JoinData synced between Sidebar and Botting Mode"
          />
          <Toggle
            checked={s.get("General", "BottingDualPanelDialog", "true") === "true"}
            onChange={(v) => s.setBool("General", "BottingDualPanelDialog", v)}
            label="Use dual-panel Botting dialog"
            description="Shows setup and live cycle side-by-side with a 1/3 + 2/3 layout"
          />
          <Divider />
        </>
      )}

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

      {showRobloxClientSection && (
        <>
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
            onChange={(v) =>
              s.setNumber("General", "ClientVolume", Math.max(0, Math.min(100, v)) / 100)
            }
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
        </>
      )}

      {bottingEnabled && (
        <>
          <Divider />
          <SectionLabel>Botting Client Profiles</SectionLabel>
          <div className="text-[11px] text-zinc-500 px-1 pb-2">
            {bottingUseSharedClientProfile
              ? "Botting launches currently use the Roblox Client settings section for both player and bot accounts."
              : "Split mode is active: configure dedicated player and bot client launch profiles below."}
          </div>

          <div
            className={`grid transition-all duration-300 ease-out ${
              showSplitBottingProfiles ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
            }`}
            aria-hidden={!showSplitBottingProfiles}
          >
            <div className="overflow-hidden">
              {renderBottingClientProfile("Player Account Profile", "BottingPlayer")}
              <Divider />
              {renderBottingClientProfile("Bot Account Profile", "BottingBot")}
            </div>
          </div>
        </>
      )}

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

      <Divider />
      <SectionLabel>Security</SectionLabel>
      <div className="flex items-center justify-between gap-3 py-2 px-1 rounded-lg border border-zinc-800/70 bg-zinc-900/35">
        <div className="min-w-0">
          <div className="text-[13px] text-zinc-200">{t("Change Encryption Method")}</div>
          <div className="text-[11px] text-zinc-500 mt-0.5">
            {t("Re-encrypts your current AccountData.json with the selected method.")}
          </div>
        </div>
        <button
          type="button"
          onClick={onRequestEncryptionSetup}
          className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/70 text-[12px] text-zinc-200 font-medium transition-colors"
        >
          {t("Open")}
        </button>
      </div>
    </div>
  );
}
