import { useTr } from "../../i18n/text";

export function NumberField({
  value,
  onChange,
  label,
  min,
  max,
  step,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  const t = useTr();
  return (
    <div className="flex items-center gap-3 py-2 px-1">
      <span className="text-[13px] text-zinc-300 shrink-0">{t(label)}</span>
      <div className="flex items-center gap-1.5 ml-auto">
        <input
          type="number"
          value={value}
          onChange={(e) => {
            let v = parseFloat(e.target.value);
            if (isNaN(v)) v = min ?? 0;
            if (min !== undefined) v = Math.max(min, v);
            if (max !== undefined) v = Math.min(max, v);
            onChange(v);
          }}
          min={min}
          max={max}
          step={step ?? 1}
          className="w-20 px-2.5 py-1 bg-zinc-800/60 border border-zinc-700/60 rounded-md text-[13px] text-zinc-200 text-right focus:outline-none focus:border-sky-500/40 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        {suffix && <span className="text-[11px] text-zinc-600">{t(suffix)}</span>}
      </div>
    </div>
  );
}
