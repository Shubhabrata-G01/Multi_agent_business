import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Company Builder",
  description:
    "Submit a business idea and let the 38-agent AI company build it end to end.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
