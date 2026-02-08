export function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="theme-label text-[10px] font-medium uppercase tracking-wider">{title}</div>
      {children}
    </div>
  );
}
