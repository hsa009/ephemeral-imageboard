import type { Metadata } from "next";
import "./globals.css";
import WalletContextProvider from "@/components/WalletProvider";
import { AuthProvider } from "@/components/AuthProvider";

export const metadata: Metadata = {
  title: "0null",
  description: "Ephemeral text and image board",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <WalletContextProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </WalletContextProvider>
      </body>
    </html>
  );
}