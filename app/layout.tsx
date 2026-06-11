import { Geist_Mono, Manrope, Nunito_Sans } from "next/font/google";
import type React from "react";

import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { cn } from "@/shared/lib/utils";

const manropeHeading = Manrope({
  subsets: ["latin"],
  variable: "--font-heading",
});

const nunitoSans = Nunito_Sans({ subsets: ["latin"], variable: "--font-sans" });

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.JSX.Element {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontMono.variable,
        "font-sans",
        nunitoSans.variable,
        manropeHeading.variable,
      )}
    >
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
