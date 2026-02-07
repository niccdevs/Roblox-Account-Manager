export function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const safeColor = value.startsWith("#") && (value.length === 7 || value.length === 4) ? value : "#000000";
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-zinc-300">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={safeColor}
          onChange={(e) => onChange(e.target.value)}
          className="w-7 h-7 rounded border border-zinc-700 cursor-pointer bg-transparent"
        />
        <span className="text-[10px] text-zinc-500 font-mono w-16">{value}</span>
      </div>
    </div>
  );
}
