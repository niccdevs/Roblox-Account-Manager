import { useState } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export function UpdateBanner({ update }: { update: Update }) {
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState(0);

  async function handleInstall() {
    setInstalling(true);
    let total = 0;
    let downloaded = 0;
    await update.downloadAndInstall((event) => {
      if (event.event === "Started" && event.data.contentLength) {
        total = event.data.contentLength;
      } else if (event.event === "Progress") {
        downloaded += event.data.chunkLength;
        if (total > 0) setProgress(Math.round((downloaded / total) * 100));
      }
    });
    await relaunch();
  }

  return (
    <div className="flex items-center justify-between px-4 py-1.5 bg-sky-600/15 border-b border-sky-500/20 shrink-0">
      <span className="text-xs text-sky-300">
        v{update.version} available
      </span>
      <button
        onClick={handleInstall}
        disabled={installing}
        className="text-xs font-medium text-sky-400 hover:text-sky-300 disabled:text-sky-600 transition-colors"
      >
        {installing ? (progress > 0 ? `${progress}%` : "Downloading...") : "Download & Install"}
      </button>
    </div>
  );
}
