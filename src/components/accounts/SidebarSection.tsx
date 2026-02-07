export function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">{title}</div>
      {children}
    </div>
  );
}
