import Link from "next/link";
import { db } from "@/lib/db";
import { SetPasswordForm } from "./set-password-form";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await db.user.findUnique({ where: { inviteToken: token }, include: { employee: true } });
  const valid = user && user.active && user.inviteExpires && user.inviteExpires > new Date();

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-semibold tracking-tight">
            {valid ? `Willkommen${user.employee ? `, ${user.employee.firstName}` : ""}!` : "Link ungültig"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {valid
              ? "Lege dein Passwort für die KDC-Einsatzplanung fest."
              : "Dieser Einladungslink ist abgelaufen oder wurde bereits verwendet. Bitte wende dich an deine Planung."}
          </p>
        </div>
        {valid ? (
          <SetPasswordForm token={token} email={user.email} />
        ) : (
          <Link href="/login" className="block text-center text-sm text-primary hover:underline">
            Zur Anmeldung
          </Link>
        )}
      </div>
    </main>
  );
}
