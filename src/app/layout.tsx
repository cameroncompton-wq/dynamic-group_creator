import "./globals.css";
import type { ReactNode } from "react";
import { AppStoreProvider } from "../store/appStore";
import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata = {
  title: "Dynamic Group Creator | LogicMonitor",
  description: "Schema-driven LogicMonitor device group generator"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className={inter.className}>
        <AppStoreProvider>{children}</AppStoreProvider>
      </body>
    </html>
  );
}
