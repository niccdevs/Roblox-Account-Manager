import type { UseSettingsReturn } from "../../hooks/useSettings";
import { Toggle } from "../ui/Toggle";
import { RestartBadge } from "../ui/RestartBadge";
import { useTr } from "../../i18n/text";
import { useStore } from "../../store";
import { ENABLE_WEBSERVER } from "../../featureFlags";

export function DeveloperTab({ s }: { s: UseSettingsReturn }) {
  const t = useTr();
  const store = useStore();
  return (
    <div className="space-y-0">
      <Toggle
        checked={s.getBool("Developer", "DevMode")}
        onChange={(v) => s.setBool("Developer", "DevMode", v)}
        label="Enable Developer Mode"
        description="Show advanced options like auth tickets, field editing, and raw links"
      />
      {ENABLE_WEBSERVER && (
        <Toggle
          checked={s.getBool("Developer", "EnableWebServer")}
          onChange={(v) => s.setBool("Developer", "EnableWebServer", v)}
          label={
            <>
              {t("Enable Web Server")}
              <RestartBadge />
            </>
          }
          description="Start a local HTTP API for external tools and scripts"
        />
      )}

      <div className="px-1 py-3">
        <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800/70 bg-zinc-900/35 px-3 py-2">
          <div className="min-w-0">
            <div className="text-[13px] text-zinc-200">Update Modal Preview</div>
            <div className="mt-0.5 text-[11px] text-zinc-500">
              Opens a mocked release note so you can test markdown rendering
            </div>
          </div>
          <button
            type="button"
            onClick={store.openUpdatePreviewDialog}
            className="shrink-0 rounded-lg border border-zinc-700/70 bg-zinc-800 px-3 py-1.5 text-[12px] font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
          >
            Open Preview
          </button>
        </div>
      </div>
    </div>
  );
}
