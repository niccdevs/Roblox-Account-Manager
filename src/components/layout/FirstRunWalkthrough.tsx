import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../../store";
import { useTr } from "../../i18n/text";
import { Select } from "../ui/Select";

interface WalkthroughStep {
  id: string;
  title: string;
  summary: string;
  highlights: string[];
  targets?: string[];
  missingTargetHint?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function FirstRunWalkthrough() {
  const t = useTr();
  const store = useStore();
  const [stepIndex, setStepIndex] = useState(0);
  const [languageSelected, setLanguageSelected] = useState(false);
  const [languageSaving, setLanguageSaving] = useState(false);
  const isFirstRunMode = store.firstRunWalkthroughMode === "firstRun";
  const currentLanguage = store.settings?.General?.Language || "en";
  const isLanguageStep = stepIndex === 0;

  useEffect(() => {
    setLanguageSelected(store.firstRunWalkthroughMode !== "firstRun");
  }, [store.firstRunWalkthroughOpen, store.firstRunWalkthroughMode]);

  const handleLanguageChange = async (value: string) => {
    setLanguageSelected(false);
    setLanguageSaving(true);
    try {
      await invoke("update_setting", {
        section: "General",
        key: "Language",
        value,
      });
      await store.reloadSettings();
      setLanguageSelected(true);
    } catch {
      setLanguageSelected(false);
      store.addToast(t("Failed to change language"));
    } finally {
      setLanguageSaving(false);
    }
  };

  const steps = useMemo<WalkthroughStep[]>(
    () => [
      {
        id: "language",
        title: t("Select language"),
        summary: t("Choose your language first, then continue with the guided setup."),
        highlights: [
          t("Walkthrough text updates in your selected language"),
          t("You can change this later in Settings at any time"),
        ],
      },
      {
        id: "add-account",
        title: t("Add your first account"),
        summary: t("Browser Login is the easiest and safest way to start."),
        highlights: [
          t("Use Add in the top toolbar for Quick Add, Browser Login, and imports"),
          t("When the list is empty, the center Add shortcut works too"),
        ],
        targets: ["[data-tour='toolbar-add']", "[data-tour='empty-add']"],
        actionLabel: t("Open Login Browser"),
        onAction: () => {
          void store.openLoginBrowser();
        },
      },
      {
        id: "list-signals",
        title: t("Learn the account list signals"),
        summary: t("Status dots and selection shortcuts help you manage large account sets."),
        highlights: [
          t("Red means invalid session, amber means aged, sky/green/violet means presence"),
          t("Ctrl/Cmd click toggles accounts, Shift click selects a range"),
        ],
        targets: ["[data-tour='accounts-list']"],
      },
      {
        id: "launch-sidebar",
        title: t("Use the launch panel"),
        summary: t("Select one account to reveal launch controls on the right."),
        highlights: [
          t("Place ID is required, Job ID and Launch Data are optional"),
          t("Save launch fields to the account once your target is dialed in"),
        ],
        targets: ["[data-tour='launch-sidebar']"],
        missingTargetHint: t("Select one account to reveal the launch sidebar, then continue"),
        actionLabel: t("Show Launch Panel"),
        onAction: () => {
          store.setSidebarOpen(true);
        },
      },
      {
        id: "safety",
        title: t("Power settings, used carefully"),
        summary: t("Only enable advanced features after your basic launch flow is stable."),
        highlights: [
          t("Multi Roblox and Botting are powerful but higher risk"),
          t("Keep online-join warnings enabled until you fully trust your routine"),
        ],
        targets: ["[data-tour='toolbar-settings']"],
        actionLabel: t("Open Settings"),
        onAction: () => {
          store.setSettingsOpen(true);
        },
      },
      {
        id: "ready",
        title: t("You're ready to roll"),
        summary: t("Run this quick checklist before scaling up."),
        highlights: [
          t("Add one valid account and confirm a single launch works"),
          t("Then move to multi-launch, grouping, and optional automation"),
        ],
        targets: ["[data-tour='status-bar']"],
      },
    ],
    [
      store.openLoginBrowser,
      store.setSettingsOpen,
      store.setSidebarOpen,
      t,
    ]
  );

  const activeStep = steps[Math.min(stepIndex, steps.length - 1)];

  const activeTarget = useMemo(() => {
    if (!activeStep?.targets || activeStep.targets.length === 0) return null;
    for (const selector of activeStep.targets) {
      const element = document.querySelector<HTMLElement>(selector);
      if (element) return element;
    }
    return null;
  }, [
    activeStep,
    store.accounts.length,
    store.selectedAccount?.UserID,
    store.selectedAccounts.length,
    store.sidebarOpen,
    store.settingsOpen,
  ]);

  const [focusRect, setFocusRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  useEffect(() => {
    if (!activeTarget) {
      setFocusRect(null);
      return;
    }

    const update = () => {
      const rect = activeTarget.getBoundingClientRect();
      setFocusRect({
        left: Math.max(8, rect.left - 8),
        top: Math.max(8, rect.top - 8),
        width: Math.max(24, rect.width + 16),
        height: Math.max(24, rect.height + 16),
      });
    };

    update();
    const timer = window.setInterval(update, 140);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [activeTarget, stepIndex]);

  useEffect(() => {
    if (stepIndex <= steps.length - 1) return;
    setStepIndex(steps.length - 1);
  }, [stepIndex, steps.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (event.key === "ArrowRight") {
        if (isLanguageStep && (!languageSelected || languageSaving)) return;
        event.preventDefault();
        setStepIndex((prev) => Math.min(steps.length - 1, prev + 1));
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setStepIndex((prev) => Math.max(0, prev - 1));
      }
      if (event.key === "Escape") {
        event.preventDefault();
        if (isFirstRunMode) {
          void store.skipFirstRunWalkthrough();
        } else {
          store.closeFirstRunWalkthrough();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    isFirstRunMode,
    isLanguageStep,
    languageSaving,
    languageSelected,
    steps.length,
    store.closeFirstRunWalkthrough,
    store.skipFirstRunWalkthrough,
  ]);

  const progress = ((stepIndex + 1) / steps.length) * 100;
  const isLastStep = stepIndex === steps.length - 1;
  const showMissingTargetHint = !!activeStep.targets?.length && !activeTarget;

  return (
    <div className="fixed inset-0 z-[95] pointer-events-none">
      {focusRect ? (
        <div
          className="walkthrough-focus-ring"
          style={{
            left: focusRect.left,
            top: focusRect.top,
            width: focusRect.width,
            height: focusRect.height,
          }}
        />
      ) : (
        <div className="walkthrough-soft-scrim" />
      )}

      <div className="walkthrough-panel pointer-events-auto animate-scale-in">
        <div className="flex items-center justify-between gap-3">
          <div className="walkthrough-chip">{isFirstRunMode ? t("First-Time Walkthrough") : t("Walkthrough Replay")}</div>
          <button
            type="button"
            onClick={() => {
              if (isFirstRunMode) {
                void store.skipFirstRunWalkthrough();
              } else {
                store.closeFirstRunWalkthrough();
              }
            }}
            aria-label={t("Close walkthrough")}
            className="walkthrough-close-btn"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>

        <div className="mt-3 walkthrough-progress">
          <div className="walkthrough-progress-bar" style={{ width: `${progress}%` }} />
        </div>

        <div key={activeStep.id} className="mt-4 animate-fade-in-up">
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[15px] font-semibold tracking-tight text-[var(--panel-fg)]">{activeStep.title}</h2>
              <span className="text-[11px] theme-muted shrink-0">
                {t("Walkthrough step {{current}} of {{total}}", {
                  current: stepIndex + 1,
                  total: steps.length,
                })}
              </span>
            </div>
            <p className="mt-1.5 text-[12px] text-zinc-300 leading-relaxed">{activeStep.summary}</p>
          </div>

          {isLanguageStep ? (
            <div className="mt-3">
              <div className="text-[11px] uppercase tracking-wide theme-muted mb-1.5">{t("Language")}</div>
              <Select
                value={currentLanguage}
                options={[
                  { value: "en", label: "English" },
                  { value: "de", label: "German" },
                ]}
                onChange={(value) => {
                  void handleLanguageChange(value);
                }}
                className="w-52"
              />
              {!languageSelected && (
                <div className="walkthrough-inline-tip mt-2">{t("Please select a language to continue")}</div>
              )}
              {languageSaving && (
                <div className="text-[11px] theme-muted mt-2">{t("Applying language...")}</div>
              )}
            </div>
          ) : null}

          <div className="mt-3 space-y-1.5">
            {activeStep.highlights.map((highlight) => (
              <div key={highlight} className="walkthrough-highlight-row">
                <span className="walkthrough-highlight-dot" />
                <span>{highlight}</span>
              </div>
            ))}
          </div>

          {showMissingTargetHint && activeStep.missingTargetHint ? (
            <div className="walkthrough-inline-tip mt-3">
              {activeStep.missingTargetHint}
            </div>
          ) : null}

          {activeStep.onAction && activeStep.actionLabel ? (
            <button
              type="button"
              onClick={activeStep.onAction}
              className="walkthrough-action-btn mt-3"
            >
              {activeStep.actionLabel}
            </button>
          ) : null}
        </div>

        <div className="mt-5 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setStepIndex((prev) => Math.max(0, prev - 1))}
            disabled={stepIndex === 0}
            className="walkthrough-secondary-btn"
          >
            <ArrowLeft size={13} strokeWidth={2} />
            <span>{t("Back")}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (isFirstRunMode) {
                  void store.skipFirstRunWalkthrough();
                } else {
                  store.closeFirstRunWalkthrough();
                }
              }}
              className="walkthrough-tertiary-btn"
            >
              {isFirstRunMode ? t("Skip Walkthrough") : t("Close")}
            </button>

            <button
              type="button"
              onClick={() => {
                if (isLastStep) {
                  void store.completeFirstRunWalkthrough();
                  return;
                }
                setStepIndex((prev) => Math.min(steps.length - 1, prev + 1));
              }}
              disabled={isLanguageStep && (!languageSelected || languageSaving)}
              className="walkthrough-primary-btn"
            >
              <span>{isLastStep ? t("Finish") : t("Next")}</span>
              {!isLastStep ? <ArrowRight size={13} strokeWidth={2} /> : null}
            </button>
          </div>
        </div>

        <div className="mt-3 text-[11px] theme-muted">
          {t("You can skip now and replay this anytime in Settings.")}
        </div>
      </div>
    </div>
  );
}
