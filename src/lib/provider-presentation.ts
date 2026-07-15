export type ProviderPresentation = {
  label: string;
  shortLabel: string;
  color: string;
};

const providerPresentation: Record<string, ProviderPresentation> = {
  "google-sheets": { label: "Google Sheets", shortLabel: "GS", color: "#22c55e" },
  calendly: { label: "Calendly", shortLabel: "CA", color: "#3b82f6" },
  brevo: { label: "Brevo", shortLabel: "BR", color: "#f59e0b" },
  instantly: { label: "Instantly", shortLabel: "IN", color: "#ec4899" },
  close: { label: "Close CRM", shortLabel: "CL", color: "#f97316" },
  webhook: { label: "Webhook", shortLabel: "WH", color: "#8b5cf6" },
};

export function getProviderPresentation(provider: string): ProviderPresentation {
  return (
    providerPresentation[provider] ?? {
      label: provider.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
      shortLabel: provider.slice(0, 2).toUpperCase(),
      color: "#8b5cf6",
    }
  );
}
