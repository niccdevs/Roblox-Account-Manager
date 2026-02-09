type UpdateBannerData = {
  version: string;
};

export function UpdateBanner({ update }: { update: UpdateBannerData }) {
  return (
    <div className="flex items-center justify-between px-4 py-1.5 bg-sky-600/15 border-b border-sky-500/20 shrink-0">
      <span className="text-xs text-sky-300">
        v{update.version} available
      </span>
      <button
        disabled
        className="text-xs font-medium text-sky-400 hover:text-sky-300 disabled:text-sky-600 transition-colors"
      >
        Updates Disabled
      </button>
    </div>
  );
}
