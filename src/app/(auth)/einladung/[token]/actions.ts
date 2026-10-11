"use server";

import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { signIn } from "@/auth";

export async function setPasswordAction(_prev: string | null, formData: FormData): Promise<string | null> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 10) return "Das Passwort muss mindestens 10 Zeichen lang sein.";
  if (password !== confirm) return "Die Passwörter stimmen nicht überein.";

  const user = await db.user.findUnique({ where: { inviteToken: token } });
  if (!user || !user.active || !user.inviteExpires || user.inviteExpires < new Date()) {
    return "Der Einladungslink ist ungültig oder abgelaufen.";
  }

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(password, 10), inviteToken: null, inviteExpires: null },
  });

  await signIn("credentials", { email: user.email, password, redirectTo: "/plan" });
  return null;
}
