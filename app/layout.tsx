import type { Metadata } from "next";
import { Geist, Geist_Mono, Lora } from "next/font/google";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import { WalletProvider } from "@/context/WalletContext";
import AcademicLedgerABI from "@/contracts/AcademicLedger.json";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const lora      = Lora({ variable: "--font-lora", subsets: ["latin"], style: ["normal", "italic"] });
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS!;

export const metadata: Metadata = {
  title: "Proof-of-Priority — DLT Authorship Ledger",
  description: "Decentralised immutable authorship validation for academic research.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} ${lora.variable} antialiased`}>
        <WalletProvider contractAddress={CONTRACT_ADDRESS} contractABI={AcademicLedgerABI.abi}>
          {children}
        </WalletProvider>
        <Toaster position="bottom-right" toastOptions={{ duration:5000, style:{ background:"#FAFAF8", border:"1px solid #D4CFC8", color:"#1a1a18", fontFamily:"var(--font-geist-sans)", fontSize:"13px", borderRadius:"6px", padding:"10px 14px", boxShadow:"0 2px 8px rgba(0,0,0,0.08)" }, success:{ iconTheme:{ primary:"#2D6A4F", secondary:"#FAFAF8" } }, error:{ iconTheme:{ primary:"#9B2335", secondary:"#FAFAF8" } }, loading:{ iconTheme:{ primary:"#5C6BC0", secondary:"#FAFAF8" } } }} />
      </body>
    </html>
  );
}
