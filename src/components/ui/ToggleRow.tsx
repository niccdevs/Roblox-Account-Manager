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
      <span className="text-xs text-zinc-300">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className={`w-8 h-[18px] rounded-full transition-colors relative ${
          checked ? "bg-sky-500" : "bg-zinc-700"
        }`}
      >
        <div
          className={`w-3.5 h-3.5 rounded-full bg-white absolute top-[2px] transition-all ${
            checked ? "left-[17px]" : "left-[2px]"
          }`}
        />
      </button>
    </div>
  );
}
