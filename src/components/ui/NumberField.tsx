import { useCallback, useEffect, useRef, useState } from "react";
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
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);
  const idleCommitTimerRef = useRef<number | null>(null);
  const latestRef = useRef({ draft: String(value), value });

  const clearIdleTimer = useCallback(() => {
    if (idleCommitTimerRef.current !== null) {
      window.clearTimeout(idleCommitTimerRef.current);
      idleCommitTimerRef.current = null;
    }
  }, []);

  const normalizeDraft = useCallback(
    (raw: string) => {
      let next = parseFloat(raw);
      if (Number.isNaN(next)) next = value;
      if (min !== undefined) next = Math.max(min, next);
      if (max !== undefined) next = Math.min(max, next);
      return next;
    },
    [max, min, value]
  );

  const flushDraft = useCallback(
    (raw?: string) => {
      const source = raw ?? latestRef.current.draft;
      const next = normalizeDraft(source);
      if (next !== latestRef.current.value) onChange(next);
      clearIdleTimer();
      return next;
    },
    [clearIdleTimer, normalizeDraft, onChange]
  );

  const commitDraft = useCallback(
    (raw?: string) => {
      const next = flushDraft(raw);
      setDraft(String(next));
      latestRef.current = { draft: String(next), value: next };
    },
    [flushDraft]
  );

  const scheduleIdleCommit = useCallback(() => {
    clearIdleTimer();
    idleCommitTimerRef.current = window.setTimeout(() => {
      commitDraft();
    }, 5000);
  }, [clearIdleTimer, commitDraft]);

  useEffect(() => {
    if (!focused) {
      const next = String(value);
      setDraft(next);
      latestRef.current = { draft: next, value };
    }
  }, [focused, value]);

  useEffect(() => {
    return () => {
      if (focused) {
        flushDraft(latestRef.current.draft);
      } else {
        clearIdleTimer();
      }
    };
  }, [clearIdleTimer, flushDraft, focused]);

  return (
    <div className="flex items-center gap-3 py-2 px-1">
      <span className="text-[13px] text-zinc-300 shrink-0">{t(label)}</span>
      <div className="flex items-center gap-1.5 ml-auto">
        <input
          type="number"
          value={draft}
          onChange={(e) => {
            const next = e.target.value;
            setDraft(next);
            latestRef.current = { draft: next, value };
            scheduleIdleCommit();
          }}
          onFocus={() => {
            setFocused(true);
            scheduleIdleCommit();
          }}
          onBlur={() => {
            setFocused(false);
            commitDraft(draft);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commitDraft(draft);
              (e.currentTarget as HTMLInputElement).blur();
            }
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
