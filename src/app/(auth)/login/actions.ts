"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";

export async function loginAction(_prev: string | null, formData: FormData): Promise<string | null> {
  try {
    await signIn("credentials", {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      redirectTo: "/plan",
    });
    return null;
  } catch (e) {
    if (e instanceof AuthError) return "E-Mail oder Passwort ist falsch.";
    throw e;
  }
}
