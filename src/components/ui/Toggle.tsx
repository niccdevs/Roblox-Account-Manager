import { useTr, trNode } from "../../i18n/text";

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: React.ReactNode;
  description?: string;
}) {
  const t = useTr();
  return (
    <div
      className="group flex items-start gap-3 py-2 px-1 rounded-lg cursor-pointer select-none transition-colors hover:bg-white/[0.02]"
      onClick={() => onChange(!checked)}
    >
      <div className="relative mt-0.5 shrink-0">
        <div
          className={`w-8 h-[18px] rounded-full transition-all duration-200 ${
            checked ? "bg-sky-500" : "bg-zinc-700"
          }`}
        />
        <div
          className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all duration-200 ${
            checked ? "left-[16px] shadow-[0_0_6px_rgba(14,165,233,0.4)]" : "left-[2px] shadow-sm"
          }`}
        />
      </div>
      <div className="min-w-0">
        <div className="text-[13px] text-zinc-200 leading-tight">{trNode(label, t)}</div>
        {description && (
          <div className="text-[11px] text-zinc-500 leading-snug mt-0.5">{t(description)}</div>
        )}
      </div>
    </div>
  );
}
