import { useStore } from "../../store";
import { MultiSelectSidebar } from "./MultiSelectSidebar";
import { SingleSelectSidebar } from "./SingleSelectSidebar";
import { useTr } from "../../i18n/text";

export function DetailSidebar() {
  const t = useTr();
  const store = useStore();

  if (store.selectedAccounts.length > 1) {
    return <MultiSelectSidebar />;
  }

  if (!store.selectedAccount) {
    return (
      <div className="theme-surface theme-border w-72 border-l flex flex-col items-center justify-center shrink-0">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="theme-muted mb-3">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
        </svg>
        <p className="theme-muted text-xs">{t("Select an account")}</p>
      </div>
    );
  }

  return <SingleSelectSidebar />;
}
