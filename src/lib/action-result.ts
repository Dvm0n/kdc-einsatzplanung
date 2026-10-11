export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

export function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}

export function zodMessage(e: { issues: { message: string }[] }) {
  return e.issues[0]?.message ?? "Ungültige Eingabe";
}
