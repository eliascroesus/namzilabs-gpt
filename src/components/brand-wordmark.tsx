export function BrandWordmark({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <span className="brand-compact" aria-hidden="true">
        n<span>.</span>
      </span>
    );
  }
  return (
    <span className="brand-wordmark" aria-label="Namzilabs">
      namzilabs<span>.</span>
    </span>
  );
}
