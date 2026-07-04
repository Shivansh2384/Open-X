import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenX — Unlimited AI. No login. No limits.",
  description:
    "OpenX is a fully free, unlimited AI chat platform. No login, no signup, instant access. Chat with ShivanshAI-1.1 — fast, simple, and beautifully minimal.",
  applicationName: "OpenX",
  keywords: [
    "OpenX",
    "AI chat",
    "free AI",
    "ShivanshAI",
    "no login AI",
    "unlimited AI chat",
  ],
};

export const viewport: Viewport = {
  themeColor: "#08080c",
  width: "device-width",
  initialScale: 1,
};

// Runs before hydration to apply the saved theme and avoid a flash of the
// wrong color scheme. Defaults to dark mode.
const themeScript = `(function(){try{var t=localStorage.getItem('openx.theme.v1');t=t?JSON.parse(t):'dark';if(t!=='light'){document.documentElement.classList.add('dark');}}catch(e){document.documentElement.classList.add('dark');}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
