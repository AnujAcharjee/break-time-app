import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Smoke Break",
  description: "Chat with a stranger while the cigarette lasts. Anonymous voice conversations, one smoke at a time.",
  keywords: ["anonymous", "chat", "voice", "social", "smoke break"],
  openGraph: {
    title: "Smoke Break",
    description: "Anonymous voice chat. One cigarette at a time.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full bg-[#0c0c13] text-[#e2e2e9] overflow-hidden">
        {children}
      </body>
    </html>
  );
}
