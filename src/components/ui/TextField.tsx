import { useTr } from "../../i18n/text";

export function TextField({
  value,
  onChange,
  label,
  placeholder,
  pattern,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder?: string;
  pattern?: RegExp;
}) {
  const t = useTr();
  return (
    <div className="flex items-center gap-3 py-2 px-1">
      <span className="text-[13px] text-zinc-300 shrink-0">{t(label)}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          let v = e.target.value;
          if (pattern) v = v.replace(pattern, "");
          onChange(v);
        }}
        placeholder={placeholder ? t(placeholder) : undefined}
        className="flex-1 min-w-0 px-2.5 py-1 bg-zinc-800/60 border border-zinc-700/60 rounded-md text-[13px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-sky-500/40 transition-colors"
      />
    </div>
  );
}
