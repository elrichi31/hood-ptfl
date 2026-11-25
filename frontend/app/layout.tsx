import type { Metadata } from "next";
import { DM_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";

// Geometric, friendly grotesque for UI text.
const inter = DM_Sans({
  variable: "--font-sans-app",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Zenlor Labs — Private Market Analytics",
  description: "Zenlor Labs private portfolio analytics (invite-only)."
};

// Runs before paint so the theme is correct on first frame (no flash). Defaults to dark
// instead of following the OS, which flipped the app whenever Windows auto-switched themes.
const themeInitScript = `
try {
  var t = localStorage.getItem("theme") || "dark";
  document.documentElement.setAttribute("data-theme", t);
  // Viewer's time zone for crypto's midnight baseline (read server-side, see robinhoodToday).
  document.cookie = "tz=" + Intl.DateTimeFormat().resolvedOptions().timeZone + ";path=/;max-age=31536000;samesite=lax";
} catch (e) {
  document.documentElement.setAttribute("data-theme", "dark");
}
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
