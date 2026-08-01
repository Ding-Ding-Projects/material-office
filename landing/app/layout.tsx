import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Material Office — Windows office workspace",
  description:
    "Explore Material Office, a local Windows office workspace with documented feature boundaries, LibreOffice integration, settings, and public legal records.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
