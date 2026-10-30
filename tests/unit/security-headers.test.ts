import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "@/lib/security/headers";

const directives = (csp: string) => Object.fromEntries(csp.split("; ").map((d) => [d.split(" ")[0]!, d.split(" ").slice(1)]));
const get = (headers: { key: string; value: string }[], key: string) => headers.find((h) => h.key === key)?.value;

describe("content security policy", () => {
  const csp = directives(contentSecurityPolicy({ production: true }));

  it("allows no third-party origin anywhere", () => {
    for (const [name, values] of Object.entries(csp)) {
      for (const v of values) expect(v, `${name} ${v}`).not.toMatch(/^(https?:|\*|wss?:)/);
    }
    expect(csp["default-src"]).toEqual(["'self'"]);
    // The browser never talks to YouCam or any storage host directly.
    expect(csp["connect-src"]).toEqual(["'self'"]);
  });

  it("locks down framing, objects, base and form targets", () => {
    expect(csp["frame-ancestors"]).toEqual(["'none'"]);
    expect(csp["object-src"]).toEqual(["'none'"]);
    expect(csp["base-uri"]).toEqual(["'self'"]);
    expect(csp["form-action"]).toEqual(["'self'"]);
  });

  it("allows what the product needs and no more: blob/data images, WASM without JS eval, inline style attributes only", () => {
    expect(csp["img-src"]).toEqual(["'self'", "blob:", "data:"]);
    expect(csp["script-src"]).toContain("'wasm-unsafe-eval'");
    expect(csp["script-src"]).not.toContain("'unsafe-eval'");
    // <style> elements are blocked except four exact, hash-listed contents from our UI libraries.
    expect(csp["style-src"]![0]).toBe("'self'");
    expect(csp["style-src"]).not.toContain("'unsafe-inline'");
    for (const v of csp["style-src"]!.slice(1)) expect(v).toMatch(/^'sha256-[A-Za-z0-9+/]{43}='$/);
    expect(csp["style-src-attr"]).toEqual(["'unsafe-inline'"]);
    expect(csp["worker-src"]).toEqual(["'self'", "blob:"]);
  });

  it("upgrades insecure requests in production only", () => {
    expect(contentSecurityPolicy({ production: true })).toContain("upgrade-insecure-requests");
    expect(contentSecurityPolicy({ production: false })).not.toContain("upgrade-insecure-requests");
  });
});

describe("security headers", () => {
  it("production sets the CSP and HSTS; development leaves them off so HMR keeps working", () => {
    const prod = securityHeaders({ production: true });
    expect(get(prod, "Content-Security-Policy")).toBeDefined();
    expect(get(prod, "Strict-Transport-Security")).toMatch(/max-age=31536000/);
    const dev = securityHeaders({ production: false });
    expect(get(dev, "Content-Security-Policy")).toBeUndefined();
    expect(get(dev, "Strict-Transport-Security")).toBeUndefined();
  });

  it("every environment gets the privacy and framing headers", () => {
    for (const production of [true, false]) {
      const h = securityHeaders({ production });
      expect(get(h, "Referrer-Policy")).toBe("no-referrer");
      expect(get(h, "X-Content-Type-Options")).toBe("nosniff");
      expect(get(h, "X-Frame-Options")).toBe("DENY");
      expect(get(h, "Cross-Origin-Opener-Policy")).toBe("same-origin");
    }
  });

  it("allows the camera on our own origin only, and nothing else sensitive", () => {
    const policy = get(securityHeaders({ production: true }), "Permissions-Policy")!;
    expect(policy).toContain("camera=(self)");
    for (const feature of ["microphone", "geolocation", "payment", "usb"]) expect(policy).toContain(`${feature}=()`);
  });

  it("has no duplicate header names", () => {
    const keys = securityHeaders({ production: true }).map((h) => h.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
