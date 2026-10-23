import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Plus_Jakarta_Sans } from "next/font/google";
import { Suspense } from "react";
import { NavProgress } from "@/components/NavProgress";
import { ThemeSync } from "@/components/ThemeSync";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin", "latin-ext"],
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: { default: "Nanečisto", template: "%s · Nanečisto" },
  description: "Soukromá tréninková aplikace.",
  // private app – keep it out of search engines
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

// colors mirror THEME_COLOR in lib/theme.ts
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f6fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0d17" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="cs" className={`${jakarta.variable} ${bricolage.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full font-sans">
        <Suspense>
          <NavProgress />
        </Suspense>
        <ThemeSync />
        {children}
      </body>
    </html>
  );
}
