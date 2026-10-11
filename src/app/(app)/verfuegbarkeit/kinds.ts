export type AvailKind = "AVAILABLE" | "PREFERRED" | "UNAVAILABLE";

export const KIND_META: Record<AvailKind, { label: string; className: string }> = {
  PREFERRED: { label: "Bevorzugt", className: "border-success/40 bg-success/10 text-success" },
  AVAILABLE: { label: "Verfügbar", className: "border-primary/30 bg-primary/5 text-primary" },
  UNAVAILABLE: { label: "Nicht verfügbar", className: "border-destructive/30 bg-destructive/5 text-destructive" },
};
