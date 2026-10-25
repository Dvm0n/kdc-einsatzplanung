import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginForm } from "./login-form";
import { publicDemoEnabled } from "@/lib/public-demo";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/plan");

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground">
            KDC
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Einsatzplanung</h1>
          <p className="text-sm text-muted-foreground">Melde dich mit deiner E-Mail-Adresse an.</p>
        </div>
        <LoginForm />
        {publicDemoEnabled() && <a className="mt-5 block text-center text-sm underline underline-offset-4" href="/demo">Demo als Planer oder Operator öffnen</a>}
      </div>
    </main>
  );
}
