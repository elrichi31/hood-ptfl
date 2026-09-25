import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Portfolio",
  description: "Personal Robinhood portfolio dashboard.",
};

// Runs before paint so the theme is correct on first frame (no flash). Defaults to dark
// instead of following the OS, which flipped the app whenever Windows auto-switched themes.
const themeInitScript = `
try {
  var t = localStorage.getItem("theme") || "dark";
  document.documentElement.setAttribute("data-theme", t);
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
