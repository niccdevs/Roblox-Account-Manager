import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type TooltipSide = "top" | "bottom";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function Tooltip({
  content,
  children,
  side = "top",
  maxWidth = 280,
}: {
  content: ReactNode;
  children: ReactNode;
  side?: TooltipSide;
  maxWidth?: number;
}) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number; side: TooltipSide } | null>(null);

  const portalRoot = useMemo(() => {
    if (typeof document === "undefined") return null;
    return document.body;
  }, []);

  useEffect(() => {
    if (!open) return;

    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      const preferred = side;
      const autoSide: TooltipSide = preferred === "top" && r.top < 56 ? "bottom" : preferred;
      const x = clamp(r.left + r.width / 2, 12, vw - 12);
      const y = autoSide === "top" ? clamp(r.top, 12, vh - 12) : clamp(r.bottom, 12, vh - 12);
      setPos({ x, y, side: autoSide });
    };

    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, side]);

  return (
    <>
      <span
        ref={anchorRef}
        className="inline-flex"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {children}
      </span>
      {open && portalRoot && pos
        ? createPortal(
            <div
              className="fixed z-[200] pointer-events-none"
              style={{
                left: pos.x,
                top: pos.y,
                transform:
                  pos.side === "top"
                    ? "translate(-50%, calc(-100% - 10px))"
                    : "translate(-50%, 10px)",
              }}
            >
              <div
                className="relative theme-panel border theme-border rounded-lg px-2.5 py-2 shadow-2xl text-[11px] text-[var(--panel-fg)]"
                style={{ maxWidth }}
                role="tooltip"
              >
                {content}
                <div
                  className={[
                    "absolute left-1/2 -translate-x-1/2 w-2.5 h-2.5 rotate-45 bg-[var(--panel-bg)]",
                    pos.side === "top" ? "-bottom-[5px] border-l border-b" : "-top-[5px] border-r border-t",
                    "theme-border",
                  ].join(" ")}
                />
              </div>
            </div>,
            portalRoot
          )
        : null}
    </>
  );
}

