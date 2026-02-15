import { useState, useRef, useEffect } from "react";
import { useTr } from "../../i18n/text";
import { ChevronDown } from "lucide-react";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  className?: string;
}

export function Select({ value, options, onChange, className = "" }: SelectProps) {
  const t = useTr();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={`relative theme-modal-scope ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-xs text-zinc-300 hover:border-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
      >
        <span className="truncate">{selected?.label ? t(selected.label) : t(value)}</span>
        <ChevronDown size={10} strokeWidth={2.5} className={`shrink-0 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="theme-panel theme-border absolute z-50 mt-1 w-full bg-zinc-900 border border-zinc-700/60 rounded-lg shadow-2xl py-0.5 animate-scale-in overflow-hidden">
          {options.map((o) => (
            <button
              key={o.value}
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={`w-full text-left px-2.5 py-1.5 text-xs transition-colors ${
                o.value === value
                  ? "text-sky-400 bg-sky-500/10"
                  : "text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              {t(o.label)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
