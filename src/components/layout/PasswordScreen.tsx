import { useState } from "react";
import { useStore } from "../../store";
import { useTr } from "../../i18n/text";
import { ModalWindowControls } from "./ModalWindowControls";

export function PasswordScreen() {
  const t = useTr();
  const store = useStore();
  const [password, setPassword] = useState("");

  return (
    <div className="theme-app relative flex h-screen flex-col items-center justify-center overflow-hidden px-6 py-8">
      <div className="restricted-fluid-bg" aria-hidden>
        <svg className="restricted-fluid-svg restricted-fluid-svg-main" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
          <defs>
            <linearGradient id="restricted-fluid-mesh" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--buttons-bg)" />
              <stop offset="28%" stopColor="var(--accent-soft)" />
              <stop offset="56%" stopColor="var(--panel-soft)" />
              <stop offset="78%" stopColor="var(--accent-color)" stopOpacity="0.72" />
              <stop offset="100%" stopColor="var(--app-bg)" />
            </linearGradient>
            <radialGradient id="restricted-fluid-core" cx="34%" cy="32%" r="62%">
              <stop offset="0%" stopColor="var(--accent-color)" stopOpacity="0.72" />
              <stop offset="54%" stopColor="var(--accent-color)" stopOpacity="0.2" />
              <stop offset="100%" stopColor="var(--accent-color)" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="restricted-fluid-neon" cx="70%" cy="64%" r="60%">
              <stop offset="0%" stopColor="var(--panel-soft)" stopOpacity="0.92" />
              <stop offset="48%" stopColor="var(--panel-soft)" stopOpacity="0.42" />
              <stop offset="100%" stopColor="var(--panel-soft)" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="restricted-fluid-ribbon-a" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="var(--accent-soft)" stopOpacity="0.06" />
              <stop offset="42%" stopColor="var(--accent-color)" stopOpacity="0.54" />
              <stop offset="100%" stopColor="var(--panel-soft)" stopOpacity="0.08" />
            </linearGradient>
            <linearGradient id="restricted-fluid-ribbon-b" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="var(--panel-soft)" stopOpacity="0.08" />
              <stop offset="45%" stopColor="var(--accent-soft)" stopOpacity="0.58" />
              <stop offset="100%" stopColor="var(--accent-color)" stopOpacity="0.2" />
            </linearGradient>
            <filter id="restricted-fluid-displace" x="-35%" y="-35%" width="170%" height="170%" colorInterpolationFilters="sRGB">
              <feTurbulence type="fractalNoise" baseFrequency="0.0038 0.0105" numOctaves="4" seed="29" result="noise">
                <animate
                  attributeName="baseFrequency"
                  dur="20s"
                  values="0.0038 0.0105;0.006 0.014;0.0038 0.0105"
                  repeatCount="indefinite"
                />
              </feTurbulence>
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="80" xChannelSelector="R" yChannelSelector="G">
                <animate attributeName="scale" dur="16s" values="58;96;72;58" repeatCount="indefinite" />
              </feDisplacementMap>
            </filter>
            <filter id="restricted-fluid-goo" x="-35%" y="-35%" width="170%" height="170%" colorInterpolationFilters="sRGB">
              <feGaussianBlur in="SourceGraphic" stdDeviation="18" result="blur" />
              <feColorMatrix
                in="blur"
                mode="matrix"
                values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -11"
                result="goo"
              />
              <feBlend in="SourceGraphic" in2="goo" />
            </filter>
            <filter id="restricted-fluid-bloom" x="-35%" y="-35%" width="170%" height="170%">
              <feGaussianBlur stdDeviation="24" />
            </filter>
          </defs>
          <rect width="1600" height="1000" fill="var(--app-bg)" />
          <g filter="url(#restricted-fluid-displace)" opacity="0.94">
            <rect x="-260" y="-200" width="2120" height="1400" fill="url(#restricted-fluid-mesh)">
              <animateTransform
                attributeName="transform"
                type="translate"
                values="0 0; 92 32; -54 86; 0 0"
                dur="28s"
                repeatCount="indefinite"
              />
            </rect>
            <ellipse cx="380" cy="220" rx="520" ry="340" fill="url(#restricted-fluid-core)">
              <animateTransform
                attributeName="transform"
                type="translate"
                values="0 0; 84 24; -62 64; 0 0"
                dur="24s"
                repeatCount="indefinite"
              />
            </ellipse>
            <ellipse cx="1220" cy="760" rx="560" ry="360" fill="url(#restricted-fluid-neon)">
              <animateTransform
                attributeName="transform"
                type="translate"
                values="0 0; -92 -42; 60 -80; 0 0"
                dur="30s"
                repeatCount="indefinite"
              />
            </ellipse>
          </g>
          <g filter="url(#restricted-fluid-bloom)" opacity="0.56">
            <path
              d="M-260 570 C 120 290 390 760 730 500 C 980 300 1220 690 1860 440 L 1860 1160 L -260 1160 Z"
              fill="url(#restricted-fluid-ribbon-a)"
            >
              <animateTransform
                attributeName="transform"
                type="translate"
                values="0 0; 96 -42; -68 34; 0 0"
                dur="20s"
                repeatCount="indefinite"
              />
            </path>
            <path
              d="M-300 440 C 60 180 280 580 620 360 C 880 190 1100 520 1730 320 L 1730 1020 L -300 1020 Z"
              fill="url(#restricted-fluid-ribbon-b)"
            >
              <animateTransform
                attributeName="transform"
                type="translate"
                values="0 0; -78 46; 56 -32; 0 0"
                dur="24s"
                repeatCount="indefinite"
              />
            </path>
          </g>
          <g filter="url(#restricted-fluid-goo)" opacity="0.54">
            <circle cx="300" cy="230" r="160" fill="var(--accent-soft)">
              <animate attributeName="cx" dur="30s" values="300;620;240;300" repeatCount="indefinite" />
              <animate attributeName="cy" dur="22s" values="230;200;390;230" repeatCount="indefinite" />
              <animate attributeName="r" dur="26s" values="160;220;150;160" repeatCount="indefinite" />
            </circle>
            <circle cx="970" cy="350" r="180" fill="var(--panel-soft)">
              <animate attributeName="cx" dur="26s" values="970;1180;860;970" repeatCount="indefinite" />
              <animate attributeName="cy" dur="24s" values="350;470;260;350" repeatCount="indefinite" />
              <animate attributeName="r" dur="20s" values="180;230;170;180" repeatCount="indefinite" />
            </circle>
            <circle cx="1260" cy="770" r="210" fill="var(--accent-soft)">
              <animate attributeName="cx" dur="34s" values="1260;1040;1420;1260" repeatCount="indefinite" />
              <animate attributeName="cy" dur="28s" values="770;690;860;770" repeatCount="indefinite" />
              <animate attributeName="r" dur="24s" values="210;280;200;210" repeatCount="indefinite" />
            </circle>
            <circle cx="650" cy="740" r="170" fill="var(--buttons-bg)">
              <animate attributeName="cx" dur="32s" values="650;820;560;650" repeatCount="indefinite" />
              <animate attributeName="cy" dur="22s" values="740;600;820;740" repeatCount="indefinite" />
              <animate attributeName="r" dur="27s" values="170;225;155;170" repeatCount="indefinite" />
            </circle>
          </g>
        </svg>
        <div className="restricted-fluid-caustic" />
        <div className="restricted-fluid-ring restricted-fluid-ring-a" />
        <div className="restricted-fluid-ring restricted-fluid-ring-b" />
        <div className="restricted-fluid-glow restricted-fluid-glow-a" />
        <div className="restricted-fluid-glow restricted-fluid-glow-b" />
        <div className="restricted-fluid-grain" />
        <div className="restricted-fluid-vignette" />
      </div>
      <ModalWindowControls visible />
      <div className="restricted-auth-shell relative z-10 w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1
            className="restricted-auth-title text-xl font-semibold text-[var(--panel-fg)] animate-fade-in-up"
            style={{ animationDelay: "0.05s" }}
          >
            {t("Restricted Access")}
          </h1>
          <p className="restricted-auth-subtitle mt-2 text-sm theme-muted animate-fade-in-up" style={{ animationDelay: "0.1s" }}>
            {t("Enter your password to continue")}
          </p>
        </div>

        <div
          className="restricted-auth-card theme-panel theme-border rounded-xl border p-6 shadow-2xl backdrop-blur-lg animate-fade-in-up"
          style={{ animationDelay: "0.2s" }}
        >
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
            className="restricted-auth-input theme-input mb-4 w-full rounded-lg px-4 py-2.5 text-sm focus:outline-none transition-colors"
            autoFocus
          />
          <button
            onClick={() => store.unlock(password)}
            disabled={store.unlocking || !password}
            className="restricted-auth-btn theme-btn w-full rounded-lg px-4 py-2.5 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {store.unlocking ? t("Unlocking...") : t("Continue")}
          </button>
        </div>
      </div>
    </div>
  );
}
