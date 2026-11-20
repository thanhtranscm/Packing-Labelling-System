import type { Metadata } from "next";
import "./globals.css";
import {bootRecoveryScript} from "@/lib/boot-recovery";

export const metadata: Metadata = {
  title: "Packing & Labelling Portal",
  description: "WSV and CTC purchase planning and production material usage.",
  other: {

  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}<script dangerouslySetInnerHTML={{__html:bootRecoveryScript}}/></body>
    </html>
  );
}
