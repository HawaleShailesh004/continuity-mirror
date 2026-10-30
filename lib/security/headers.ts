// Security headers for every response (frontend plan §7, backend plan B7). Plain TypeScript with no
// framework imports so next.config.ts can load it and tests can import it.
//
// The CSP is static (no nonces): nonces would force every page to render per request and defeat the
// prerendered, offline-capable PWA. Next streams page data in inline <script> tags whose content differs
// per page, so they cannot be hash-listed; script-src therefore allows 'unsafe-inline' (docs/adr/0006).
// What still holds: no third-party origin anywhere (connect-src, img-src, frame content via default-src),
// no objects, no framing, fixed base and form targets, and user-supplied text only rendered as text.

export type Header = { key: string; value: string };

type Options = { production: boolean };

/** `wasm-unsafe-eval` is what MediaPipe's WebAssembly needs; it does not allow JavaScript eval. */
export function contentSecurityPolicy({ production }: Options): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'"],
    // Sonner (toasts), Vaul (sheets) and Radix (scroll lock) inject a <style> element at runtime. Only these exact
    // contents are allowed, everything else stays blocked. The hashes change when those libraries change version:
    // the production console e2e (tests/e2e/console.spec.ts against `next build && next start`) fails on any
    // CSP violation, and the message names the new hash.
    "style-src": [
      "'self'",
      "'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='",
      "'sha256-StEaX+se6YS7pqjzrzMIA0KaX9zF/8zAhvQXZAe5epY='",
      "'sha256-YIjArHm2rkb5J7hX9lUM1bnQ3Kp61MTfluMGkuyKwDw='",
      "'sha256-Z5XTK23DFuEMs0PwnyZDO9SWxemQ5HxcpVaBNuUJyWY='",
    ],
    // React renders style="" attributes (motion, layout values). Attributes only; <style> elements stay blocked.
    "style-src-attr": ["'unsafe-inline'"],
    // Results, baselines and share images are blob:/data: URLs made on the device; shares come from /api (self).
    "img-src": ["'self'", "blob:", "data:"],
    "media-src": ["'self'", "blob:"],
    "font-src": ["'self'"],
    // Our API only. YouCam is never called from the browser (its key lives on the server).
    "connect-src": ["'self'"],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  if (production) directives["upgrade-insecure-requests"] = [];
  return Object.entries(directives)
    .map(([name, values]) => [name, ...values].join(" "))
    .join("; ");
}

export function securityHeaders(options: Options): Header[] {
  const headers: Header[] = [
    { key: "Referrer-Policy", value: "no-referrer" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    // Camera for the guided capture, on our own origin only. Everything else the app never needs.
    { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), serial=(), interest-cohort=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  ];
  // A development server speaks plain HTTP, needs eval and inline styles for HMR, and must keep working.
  if (options.production) {
    headers.push({ key: "Content-Security-Policy", value: contentSecurityPolicy(options) });
    headers.push({ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" });
  }
  return headers;
}
