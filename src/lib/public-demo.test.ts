import { describe, expect, it } from "vitest";
import { demoAccount, publicDemoEnabled } from "./public-demo";

const url = "postgresql://portfolio_demo_app:example@localhost/portfolio_demo";
const enabled = { DEMO_MODE: "true", DATABASE_URL: url, DATABASE_URL_UNPOOLED: url };

describe("public portfolio demo boundary", () => {
  it("requires explicit opt-in", () => {
    expect(publicDemoEnabled({ ...enabled, DEMO_MODE: undefined })).toBe(false);
    expect(publicDemoEnabled(enabled)).toBe(true);
  });
  it("rejects the original database, missing URLs and privileged database users", () => {
    expect(publicDemoEnabled({ ...enabled, DATABASE_URL: url.replace("/portfolio_demo", "/neondb") })).toBe(false);
    expect(publicDemoEnabled({ ...enabled, DATABASE_URL_UNPOOLED: undefined })).toBe(false);
    expect(publicDemoEnabled({ ...enabled, DATABASE_URL: url.replace("portfolio_demo_app:", "neondb_owner:") })).toBe(false);
    expect(publicDemoEnabled({ ...enabled, DATABASE_URL: "invalid" })).toBe(false);
  });
  it("allows only the two fixed fictional accounts", () => {
    expect(demoAccount("planner")).toEqual({ email: "admin@kdc.local", role: "ADMIN" });
    expect(demoAccount("operator")).toEqual({ email: "tim@kdc.local", role: "OPERATOR" });
    expect(demoAccount("admin@company.example")).toBeNull();
    expect(demoAccount(undefined)).toBeNull();
  });
});
