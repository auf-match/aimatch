import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { Sidebar } from "@/components/sidebar";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "AIслав",
  description: "AI-система матчинга дизайнеров",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" className={cn("font-sans", geist.variable)}>
      <body className="flex min-h-screen bg-background text-foreground">
        <Sidebar />
        <main className="flex-1 ml-64">{children}</main>
      </body>
    </html>
  );
}
