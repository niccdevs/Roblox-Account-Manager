export function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-[var(--panel-fg)]">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className={`w-8 h-[18px] rounded-full transition-colors relative border ${
          checked ? "bg-[var(--buttons-bg)] border-[var(--buttons-bc)]" : "bg-[var(--panel-soft)] border-[var(--border-color)]"
        }`}
        aria-pressed={checked}
      >
        <div
          className={`w-3.5 h-3.5 rounded-full bg-[var(--buttons-fg)] absolute top-[2px] transition-all ${
            checked ? "left-[17px]" : "left-[2px]"
          }`}
        />
      </button>
    </div>
  );
}
