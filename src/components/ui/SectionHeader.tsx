export function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mt-5 mb-2 first:mt-0">
      {children}
    </div>
  );
}
