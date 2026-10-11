/**
 * E-Mail-Versand über Resend (wenn RESEND_API_KEY gesetzt ist), sonst Ausgabe in der Konsole.
 */
export async function sendMail({ to, subject, text }: { to: string; subject: string; text: string }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.info(`\n[Mail an ${to}] ${subject}\n${text}\n`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.MAIL_FROM ?? "KDC Einsatzplanung <noreply@example.com>",
      to,
      subject,
      text,
    }),
  });
  if (!res.ok) console.error("Mailversand fehlgeschlagen", res.status, await res.text());
}
