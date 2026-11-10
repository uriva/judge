import type { Metadata } from "next";
import {
  Playfair_Display,
  Plus_Jakarta_Sans,
  JetBrains_Mono,
} from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-serif",
  weight: ["500", "600", "700", "800"],
  style: ["normal", "italic"],
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.BASE_URL || "https://judge-khaki-sigma.vercel.app"
  ),
  title: "THE JUDGE — AI Courtroom for WhatsApp Chats & Real-World Disputes",
  description:
    "Paste a WhatsApp correspondence or upload a photo. The Honorable AI Judge analyzes the receipts, fact-checks claims, and issues an official verdict with exact fault percentages.",
  openGraph: {
    title: "THE JUDGE — Paste a WhatsApp Chat or Photo. Get an Official Verdict.",
    description:
      "Instant, decisive AI rulings on group chat drama, bill splits, roommate crimes & real-world disputes.",
    images: ["/api/og"],
  },
  twitter: {
    card: "summary_large_image",
    title: "THE JUDGE — AI Courtroom for WhatsApp Chats & Photos",
    description:
      "Paste a WhatsApp correspondence or upload a photo. Get an official verdict and fault split.",
    images: ["/api/og"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${playfair.variable} ${jakarta.variable} ${jetbrains.variable}`}
    >
      <body className="min-h-screen bg-background text-foreground font-sans antialiased selection:bg-primary/20">
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
