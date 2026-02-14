import type { ReactNode } from "react";
import type { TOptions } from "i18next";
import { useTranslation } from "react-i18next";
import i18n from "./index";

export function tr(text: string, options?: TOptions): string {
  return i18n.t(text, {
    defaultValue: text,
    ...(options || {}),
  });
}

export function useTr() {
  const { t } = useTranslation();
  return (text: string, options?: TOptions): string =>
    t(text, {
      defaultValue: text,
      ...(options || {}),
    });
}

export function trNode(node: ReactNode, t: (text: string, options?: TOptions) => string): ReactNode {
  return typeof node === "string" ? t(node) : node;
}
