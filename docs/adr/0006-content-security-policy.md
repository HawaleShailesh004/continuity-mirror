# 0006. A static CSP: inline scripts allowed, styles hash-listed

**Status:** accepted (B7, 27 Oct 2026)

**Context.** We want a Content Security Policy, and also static, prerendered, offline-capable pages. Nonce-based CSP needs every page to render per request (Next's own docs: it disables static optimisation and is incompatible with partial prerendering). Next streams page data in inline `<script>` tags whose content differs per page, so they can't be hash-listed. The first strict attempt (`script-src 'self'`) failed on every route in a real browser.

**Decision.** `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'` (the last is for MediaPipe, and does not allow JavaScript `eval`). `style-src 'self'` plus four exact sha256 hashes for the `<style>` elements that Sonner, Vaul and Radix inject; `style-src-attr 'unsafe-inline'` for React's `style=""` attributes. Everything else is strict: `default-src 'self'`, `connect-src 'self'` (the browser never calls YouCam or storage), no objects, no framing, fixed base and form targets. Production only, so `next dev` keeps working.

**Consequences.** Script injection is not blocked by the CSP. What limits the damage: React escapes everything, user-supplied text (labels, notes) is only rendered as text, there is no third-party script or origin, and exfiltration to other origins is blocked. The style hashes change when those libraries change version; the production console e2e fails on any violation and names the new hash. To tighten later: nonces on dynamic routes only.
