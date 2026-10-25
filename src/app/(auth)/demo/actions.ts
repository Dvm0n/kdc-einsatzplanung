"use server";

import { notFound } from "next/navigation";
import { signIn } from "@/auth";
import { demoAccount, publicDemoEnabled } from "@/lib/public-demo";

export async function enterDemo(formData: FormData) {
  const role = formData.get("role");
  if (!publicDemoEnabled() || !demoAccount(role)) notFound();
  await signIn("portfolio-demo", { role, redirectTo: role === "operator" ? "/mein-plan" : "/plan" });
}
