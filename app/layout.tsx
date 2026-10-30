import type { Metadata, Viewport } from "next";
import { Figtree, Fraunces } from "next/font/google";
import { MotionProvider } from "@/components/motion/motion-provider";
import { LazyToaster } from "@/components/ui/lazy-toaster";
import { app } from "@/content/copy/app";
import { nav } from "@/content/copy/nav";
import "./globals.css";

// Self-hosted at build time by next/font: no runtime request to Google.
const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-figtree",
  display: "swap",
});

// Headlines only. SOFT rounds the serifs, opsz lets the big sizes tighten up.
const fraunces = Fraunces({
  subsets: ["latin"],
  axes: ["SOFT", "opsz"],
  variable: "--font-fraunces",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: app.name, template: `%s · ${app.name}` },
  description: app.description,
  applicationName: app.name,
};

export const viewport: Viewport = {
  // Meta tags can't read CSS variables: these mirror --bg in app/theme.css.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1724" },
  ],
  colorScheme: "light dark",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${figtree.variable} ${fraunces.variable} h-full`}>
      <body className="flex min-h-full flex-col bg-bg font-sans text-base text-text antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-action focus:px-5 focus:py-3 focus:font-semibold focus:text-on-action"
        >
          {nav.skip}
        </a>
        <MotionProvider>
          {children}
          <LazyToaster />
        </MotionProvider>
      </body>
    </html>
  );
}
