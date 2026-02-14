import { useState } from "react";
import { useStore } from "../../store";
import { useTr } from "../../i18n/text";

export function PasswordScreen() {
  const t = useTr();
  const store = useStore();
  const [password, setPassword] = useState("");

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-zinc-950">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-semibold text-zinc-100 animate-fade-in-up" style={{ animationDelay: "0.05s" }}>
            {t("Restricted Access")}
          </h1>
          <p className="mt-2 text-sm text-zinc-500 animate-fade-in-up" style={{ animationDelay: "0.1s" }}>
            {t("Enter your password to continue")}
          </p>
        </div>

        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-6 animate-fade-in-up" style={{ animationDelay: "0.2s" }}>
          {store.error && (
            <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2.5 text-sm text-red-400 animate-fade-in">
              {store.error}
            </div>
          )}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && password && store.unlock(password)}
            placeholder={t("Password")}
            className="mb-4 w-full rounded-lg bg-zinc-800 border border-zinc-700 px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-sky-500/50 transition-colors"
            autoFocus
          />
          <button
            onClick={() => store.unlock(password)}
            disabled={store.unlocking || !password}
            className="w-full rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-sky-500 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {store.unlocking ? t("Unlocking...") : t("Continue")}
          </button>
        </div>
      </div>
    </div>
  );
}
