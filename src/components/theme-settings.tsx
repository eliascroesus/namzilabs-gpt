"use client";

import { Check, Moon, Sun } from "lucide-react";

import { useAppTheme, type AppTheme } from "@/components/app-theme";

export function ThemeSettings() {
  const { theme, setTheme } = useAppTheme();
  const choices: { value: AppTheme; label: string; detail: string; icon: typeof Sun }[] = [
    { value: "light", label: "Light", detail: "Bright analytics canvas", icon: Sun },
    { value: "dark", label: "Dark", detail: "Low-light command center", icon: Moon },
  ];
  return (
    <section className="shell-card p-5 lg:col-span-2">
      <h2 className="font-bold">Appearance</h2>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Choose how Namzi looks on this browser. Light is the default for dashboards.
      </p>
      <div className="mt-5 grid max-w-xl gap-3 sm:grid-cols-2">
        {choices.map((choice) => {
          const Icon = choice.icon;
          const active = theme === choice.value;
          return (
            <button
              key={choice.value}
              type="button"
              className={`theme-choice ${active ? "theme-choice-active" : ""}`}
              onClick={() => setTheme(choice.value)}
            >
              <span className="theme-choice-icon">
                <Icon size={18} />
              </span>
              <span className="min-w-0 flex-1 text-left">
                <strong className="block text-sm">{choice.label}</strong>
                <small className="mt-1 block text-[var(--muted)]">{choice.detail}</small>
              </span>
              {active ? <Check size={16} className="text-[var(--brand)]" /> : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
