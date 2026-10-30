# Third-party code and assets

Code copied into this repo (not installed as a dependency). Each file keeps a header naming its source and what we changed. npm dependencies are listed in `package.json` and are not repeated here.

## Copied components

All fetched 26 Oct 2026 and adapted to the Morning Light tokens (`app/theme.css`), the motion tokens (`lib/client/motion.ts`) and `LazyMotion` strict mode (`m.*` components).

| Our file | Upstream | Commit | Licence |
|---|---|---|---|
| `components/motion/text-effect.tsx` | Motion Primitives `components/core/text-effect.tsx` | `120f64f` | MIT, © 2024 ibelick |
| `components/motion/text-shimmer.tsx` | Motion Primitives `components/core/text-shimmer.tsx` | `120f64f` | MIT, © 2024 ibelick |
| `components/motion/animated-background.tsx` | Motion Primitives `components/core/animated-background.tsx` | `120f64f` | MIT, © 2024 ibelick |
| `components/motion/morphing-dialog.tsx` | Motion Primitives `components/core/morphing-dialog.tsx` | `120f64f` | MIT, © 2024 ibelick |
| `components/motion/image-comparison.tsx` | Motion Primitives `components/core/image-comparison.tsx` | `120f64f` | MIT, © 2024 ibelick |
| `components/motion/in-view.tsx` | Motion Primitives `components/core/in-view.tsx` | `120f64f` | MIT, © 2024 ibelick |
| `components/motion/transition-panel.tsx` | Motion Primitives `components/core/transition-panel.tsx` | `120f64f` | MIT, © 2024 ibelick |
| `components/motion/progressive-blur.tsx` | Motion Primitives `components/core/progressive-blur.tsx` | `120f64f` | MIT, © 2024 ibelick |
| `components/motion/blur-fade.tsx` | Magic UI `apps/www/registry/magicui/blur-fade.tsx` | `efe76fc` | MIT, © Magic UI |
| `components/motion/animated-circular-progress-bar.tsx` | Magic UI `apps/www/registry/magicui/animated-circular-progress-bar.tsx` | `efe76fc` | MIT, © Magic UI |

- Motion Primitives: https://github.com/ibelick/motion-primitives (full commit `120f64f6ca60348e251f929e9c81f11ccbe45eda`)
- Magic UI: https://github.com/magicuidesign/magicui (full commit `efe76fc5755eca1142dd4f74c1d6f0ace2887e3c`)

### Notable changes from upstream

- **Accessibility:** `ImageComparison` gained a native range input (keyboard, `aria-valuetext`), pointer capture and `touch-action: pan-y`. `MorphingDialog` had two focus bugs fixed (the trigger never registered the shared ref, so focus didn't return on close; focus was pulled to the trigger on first mount), unique title ids, and names from props instead of `"Open dialog :r1:"`.
- **Calm by default:** every component has a reduced-motion path (`useCalmMotion`). Presets that bounce, scale from zero or loop beside text were removed.
- **No raw colours:** upstream zinc/white/black values were replaced with tokens.

### MIT licence text

```
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Fonts

| Font | Source | Licence |
|---|---|---|
| Figtree | Google Fonts, self-hosted at build time by `next/font/google` (no runtime request to Google) | SIL Open Font License 1.1 |

## Images

- `public/dev/amara-before.jpg`, `public/dev/amara-coily-chin.jpg`: dev-only fixtures. The first is an AI-generated sample person (provenance in `docs/ASSETS.md`); the second is a real YouCam Hair Style v2.1 result for that person (B0 stage 3). Resized/re-encoded copies; the landing placeholder uses the first until B5's demo manifest exists.
