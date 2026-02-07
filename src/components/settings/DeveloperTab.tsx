import type { UseSettingsReturn } from "../../hooks/useSettings";
import { Toggle } from "../ui/Toggle";
import { RestartBadge } from "../ui/RestartBadge";

export function DeveloperTab({ s }: { s: UseSettingsReturn }) {
  return (
    <div className="space-y-0">
      <Toggle
        checked={s.getBool("Developer", "DevMode")}
        onChange={(v) => s.setBool("Developer", "DevMode", v)}
        label="Enable Developer Mode"
        description="Show advanced options like auth tickets, field editing, and raw links"
      />
      <Toggle
        checked={s.getBool("Developer", "EnableWebServer")}
        onChange={(v) => s.setBool("Developer", "EnableWebServer", v)}
        label={
          <>
            Enable Web Server<RestartBadge />
          </>
        }
        description="Start a local HTTP API for external tools and scripts"
      />
    </div>
  );
}
