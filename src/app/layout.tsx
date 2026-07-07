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