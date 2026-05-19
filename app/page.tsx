"use client";
import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { useWallet } from "@/context/WalletContext";
import WalletBar from "@/components/WalletBar";
import ProjectSelector from "@/components/ProjectSelector";
import LogContributionForm from "@/components/LogContributionForm";
import ManageCollaborators from "@/components/ManageCollaborators";
import ContributionTimeline from "@/components/ContributionTimeline";
import RegisterProfileModal from "@/components/RegisterProfileModal";
import AcademicLedgerABI from "@/contracts/AcademicLedger.json";

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS!;
const RPC_URL          = process.env.NEXT_PUBLIC_RPC_URL!;

export default function ProjectPage() {
  const { isConnected, isSepolia, needsProfile } = useWallet();
  const [projectId,  setProjectId]  = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [isHalted, setIsHalted] = useState(false);
  const [haltStateSupported, setHaltStateSupported] = useState(true);
  const [finalizationStatus, setFinalizationStatus] = useState<any>(null);
  const isReady = isConnected && isSepolia;

  // Use !! instead of === true so truthy values from ethers (BigInt, "true", 1) are handled correctly
  const isFinalizationActive =
    !!finalizationStatus?.isActive && !finalizationStatus?.isFinalized;

  const fetchHaltState = useCallback(async () => {
    if (!projectId) {
      setIsHalted(false);
      setHaltStateSupported(true);
      setFinalizationStatus(null);
      return;
    }

    try {
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, AcademicLedgerABI.abi, provider);
      const halted = await contract.isDisputed(projectId);
      setIsHalted(Boolean(halted));
      setHaltStateSupported(true);
    } catch (err) {
      const error = err as any;
      if (error?.code === "CALL_EXCEPTION" && typeof error?.message === "string" && error.message.includes("missing revert data")) {
        console.warn("Project-level halt state unavailable on deployed contract version.");
        setIsHalted(false);
        setHaltStateSupported(false);
        return;
      }
      console.error("Failed to fetch project halt state:", err);
      setIsHalted(false);
      setHaltStateSupported(true);
    }
  }, [projectId]);

  useEffect(() => {
    fetchHaltState();
  }, [projectId, fetchHaltState, refreshKey]);

  return (
    <div style={{ minHeight:"100vh", background:"var(--paper)", color:"var(--ink)" }}>
      <WalletBar />
      <div style={{ height:"3px", background:"var(--accent)" }} />

      {isReady && needsProfile && (
        <RegisterProfileModal
          contractAddress={CONTRACT_ADDRESS}
          contractABI={AcademicLedgerABI.abi}
        />
      )}

      <div style={{ maxWidth:"1200px", margin:"0 auto", padding:"32px 40px" }}>
        <header style={{ borderBottom:"1px solid var(--rule)", paddingBottom:"24px", marginBottom:"28px" }}>
          <div style={{ display:"flex", flexWrap:"wrap", alignItems:"flex-end", justifyContent:"space-between", gap:"16px" }}>
            <div>
              <p style={{ fontFamily:"var(--font-geist-mono)", fontSize:"10px", color:"var(--accent)", letterSpacing:"0.2em", textTransform:"uppercase", marginBottom:"6px" }}>Decentralised Ledger Technology</p>
              <h1 style={{ fontFamily:"var(--font-lora)", fontSize:"2rem", fontWeight:600, lineHeight:1.2, color:"var(--ink)", margin:0 }}>Proof-of-Priority System</h1>
              <p style={{ fontFamily:"var(--font-lora)", fontSize:"0.95rem", color:"var(--ink-3)", fontStyle:"italic", marginTop:"4px" }}>Verifiable Authorship Validation in Academic Research</p>
            </div>
            <div style={{ borderLeft:"2px solid var(--accent)", paddingLeft:"12px", textAlign:"right" }}>
              <p style={{ fontFamily:"var(--font-geist-mono)", fontSize:"10px", color:"var(--ink-4)", textTransform:"uppercase", letterSpacing:"0.15em" }}>Network</p>
              <p style={{ fontFamily:"var(--font-geist-mono)", fontSize:"12px", color:"var(--ink-2)", fontWeight:600, marginTop:"2px" }}>Ethereum Sepolia</p>
              <p style={{ fontFamily:"var(--font-geist-mono)", fontSize:"10px", color:"var(--ink-4)", marginTop:"2px" }}>EIP-1559 Testnet</p>
            </div>
          </div>
        </header>

        {!isReady ? (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:"380px", gap:"16px", textAlign:"center" }}>
            <div style={{ width:"60px", height:"60px", borderRadius:"50%", border:"1px solid var(--rule)", background:"var(--paper-2)", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <svg width="26" height="26" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color:"var(--ink-4)" }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
              </svg>
            </div>
            {!isConnected ? (
              <>
                <p style={{ fontFamily:"var(--font-lora)", fontSize:"1.1rem", color:"var(--ink-3)", fontStyle:"italic" }}>Connect your Web3 wallet to begin.</p>
                <p style={{ fontFamily:"var(--font-geist-mono)", fontSize:"11px", color:"var(--ink-4)", maxWidth:"380px", lineHeight:1.7 }}>Your Ethereum wallet address serves as your cryptographic identity. No username or password required.</p>
              </>
            ) : (
              <>
                <p style={{ fontFamily:"var(--font-lora)", fontSize:"1.1rem", color:"var(--danger)", fontStyle:"italic" }}>Wrong network detected.</p>
                <p style={{ fontFamily:"var(--font-geist-mono)", fontSize:"11px", color:"var(--ink-4)" }}>Please switch to Ethereum Sepolia to continue.</p>
              </>
            )}
          </div>
        ) : (
          <>
            <div style={{ marginBottom:"28px" }}>
              <ProjectSelector
                contractAddress={CONTRACT_ADDRESS}
                contractABI={AcademicLedgerABI.abi}
                currentProjectId={projectId}
                onProjectChange={setProjectId}
              />
            </div>

            {!projectId ? (
              <div style={{ textAlign:"center", padding:"60px 0" }}>
                <p style={{ fontFamily:"var(--font-lora)", fontSize:"1rem", fontStyle:"italic", color:"var(--ink-4)" }}>Select a project from the dropdown or create a new one.</p>
                <p style={{ fontFamily:"var(--font-geist-mono)", fontSize:"11px", color:"var(--ink-4)", marginTop:"8px" }}>Each Project ID maps to an isolated namespace on the smart contract.</p>
              </div>
            ) : (
              <>
                <div style={{ display:"grid", gridTemplateColumns:"420px 1fr", gap:"28px", alignItems:"start" }}>
                  <div style={{ display:"flex", flexDirection:"column", gap:"20px" }}>
                    {!haltStateSupported && projectId && (
                      <div style={{ border:"1px solid #FBBF24", borderRadius:"10px", background:"#FEF3C7", color:"#92400E", padding:"16px", lineHeight:1.6 }}>
                        <p style={{ fontFamily:"var(--font-geist-mono)", fontSize:"0.95rem", margin:0, fontWeight:600 }}>Compatibility notice: This deployed contract version does not support project-level arbitration freeze.</p>
                        <p style={{ fontFamily:"var(--font-geist-mono)", fontSize:"0.9rem", margin:"8px 0 0" }}>Contributions and collaborator management remain enabled until the contract is upgraded to the latest AcademicLedger implementation.</p>
                      </div>
                    )}
                    {haltStateSupported && isHalted && (
                      <div style={{ border:"1px solid #FCA5A5", borderRadius:"10px", background:"#FEE2E2", color:"#991B1B", padding:"16px", lineHeight:1.6 }}>
                        <p style={{ fontFamily:"var(--font-geist-mono)", fontSize:"0.95rem", margin:0, fontWeight:600 }}>Project Halted: Currently under institutional arbitration.</p>
                        <p style={{ fontFamily:"var(--font-geist-mono)", fontSize:"0.9rem", margin:"8px 0 0" }}>Contributions are frozen and collaborator management is disabled until arbitration is resolved.</p>
                      </div>
                    )}
                    <LogContributionForm
                      contractAddress={CONTRACT_ADDRESS}
                      contractABI={AcademicLedgerABI.abi}
                      projectId={projectId}
                      isHalted={isHalted}
                      isFinalizationActive={isFinalizationActive}
                      onSuccess={() => setRefreshKey(k => k + 1)}
                    />
                    <ManageCollaborators
                      contractAddress={CONTRACT_ADDRESS}
                      contractABI={AcademicLedgerABI.abi}
                      projectId={projectId}
                      isHalted={isHalted}
                      onResolved={fetchHaltState}
                    />
                  </div>
                  <ContributionTimeline
                    contractAddress={CONTRACT_ADDRESS}
                    contractABI={AcademicLedgerABI.abi}
                    projectId={projectId}
                    readOnlyRpcUrl={RPC_URL}
                    refreshKey={refreshKey}
                    onFinalizationStatusChange={setFinalizationStatus}
                  />
                </div>
                <footer style={{ borderTop:"1px solid var(--rule)", paddingTop:"16px", marginTop:"40px", textAlign:"center", fontFamily:"var(--font-geist-mono)", fontSize:"11px", color:"var(--ink-4)" }}>
                  All contribution records are append-only and immutable · No scoring applied · Covenant University FYP · {new Date().getFullYear()}
                </footer>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}