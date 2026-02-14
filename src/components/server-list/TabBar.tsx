import { useState, useRef, useLayoutEffect } from "react";
import type { TabId } from "./types";
import { useTr } from "../../i18n/text";

export interface TabBarProps {
  activeTab: TabId;
  onTabChange: (id: TabId) => void;
}

export function TabBar({
  activeTab,
  onTabChange,
}: TabBarProps) {
  const t = useTr();
  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    {
      id: "servers",
      label: "Servers",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
          <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
          <line x1="6" y1="6" x2="6.01" y2="6" />
          <line x1="6" y1="18" x2="6.01" y2="18" />
        </svg>
      ),
    },
    {
      id: "games",
      label: "Games",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <line x1="6" y1="3" x2="6" y2="15" />
          <circle cx="18" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <path d="M18 9a9 9 0 0 1-9 9" />
        </svg>
      ),
    },
    {
      id: "favorites",
      label: "Favorites",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ),
    },
    {
      id: "recent",
      label: "Recent",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      ),
    },
  ];

  const tabRefs = useRef<Map<TabId, HTMLButtonElement>>(new Map());
  const barRef = useRef<HTMLDivElement>(null);
  const [pillStyle, setPillStyle] = useState({ left: 0, width: 0 });
  const hasInitialized = useRef(false);

  useLayoutEffect(() => {
    const el = tabRefs.current.get(activeTab);
    const bar = barRef.current;
    if (!el || !bar) return;
    const barRect = bar.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    setPillStyle({
      left: elRect.left - barRect.left,
      width: elRect.width,
    });
    hasInitialized.current = true;
  }, [activeTab]);

  return (
    <div ref={barRef} className="relative flex gap-1 px-5 pb-0 shrink-0">
      <div
        className="absolute top-0 h-full rounded-lg bg-zinc-800 shadow-sm"
        style={{
          left: pillStyle.left,
          width: pillStyle.width,
          transition: hasInitialized.current
            ? "left 180ms cubic-bezier(0.22, 1, 0.36, 1), width 150ms cubic-bezier(0.22, 1, 0.36, 1)"
            : "none",
        }}
      />
      {tabs.map((tab) => (
        <button
          key={tab.id}
          ref={(el) => {
            if (el) tabRefs.current.set(tab.id, el);
          }}
          onClick={() => onTabChange(tab.id)}
          className={`relative z-[1] flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors duration-200 ${
            activeTab === tab.id
              ? "text-zinc-100"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <span
            className="transition-colors duration-200"
            style={{ color: activeTab === tab.id ? "rgb(56, 189, 248)" : undefined }}
          >
            {tab.icon}
          </span>
          {t(tab.label)}
        </button>
      ))}
    </div>
  );
}
