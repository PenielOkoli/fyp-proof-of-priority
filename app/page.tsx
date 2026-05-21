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
import { getContributionHash } from "@/components/contribution-timeline/utils";

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS!;
const RPC_URL          = process.env.NEXT_PUBLIC_RPC_URL!;
const DISPUTE_REASON_ABI = [
  "function projectDisputeReasons(string) view returns (string)",
  "function getProjectDisputeReason(string) view returns (string)",
];
const UNKNOWN_DISPUTED_IDENTITY = "an unknown collaborator";

type ConfirmedContribution = {
  txHash: string;
  cid: string;
  contributor: string;
  blockNumber: number | null;
};

type FinalizationStatus = {
  isFinalizationActive?: boolean;
  finalizationDeadline?: bigint | number;
  isFinalized?: boolean;
} | null;

type RpcError = {
  code?: string;
  message?: string;
};

type ContributionLike = {
  contributor: string;
  timestamp: bigint | number;
};

type DisputeEventLog = {
  blockNumber?: number;
  index?: number;
  logIndex?: number;
  args?: {
    contributionHash?: string;
  };
};

function truncateAddress(addr: string) {
  return addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : UNKNOWN_DISPUTED_IDENTITY;
}

export default function ProjectPage() {
  const { isConnected, isSepolia, needsProfile } = useWallet();
  const [projectId,  setProjectId]  = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [confirmedContribution, setConfirmedContribution] = useState<ConfirmedContribution | null>(null);
  const [isHalted, setIsHalted] = useState(false);
  const [projectDisputeReason, setProjectDisputeReason] = useState("");
  const [disputedIdentity, setDisputedIdentity] = useState(UNKNOWN_DISPUTED_IDENTITY);
  const [haltStateSupported, setHaltStateSupported] = useState(true);
  const [finalizationStatus, setFinalizationStatus] = useState<FinalizationStatus>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const isReady = isConnected && isSepolia;

  // Use !! instead of === true so truthy values from ethers (BigInt, "true", 1) are handled correctly
  const isFinalizationActive =
    !!finalizationStatus?.isFinalizationActive && !finalizationStatus?.isFinalized;
  const finalizationDeadlinePassed = Boolean(
    finalizationStatus?.isFinalizationActive
    && finalizationStatus?.finalizationDeadline
    && Number(finalizationStatus.finalizationDeadline) * 1000 <= nowMs
  );
  const isProjectImmutable = Boolean(finalizationStatus?.isFinalized || finalizationDeadlinePassed);

  const fetchHaltState = useCallback(async () => {
    if (!projectId) {
      setIsHalted(false);
      setProjectDisputeReason("");
      setDisputedIdentity(UNKNOWN_DISPUTED_IDENTITY);
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
      if (halted) {
        let identity = UNKNOWN_DISPUTED_IDENTITY;
        try {
          const storedContributions = await contract.getContributions(projectId) as ContributionLike[];

          const resolveContributionIdentity = async (contribution: ContributionLike) => {
            let resolved = truncateAddress(contribution.contributor);
            try {
              const profile = await contract.getProfile(contribution.contributor) as { exists?: boolean; name?: string };
              if (profile?.exists && profile.name) resolved = profile.name;
            } catch {
              // Fallback to the wallet label if profile lookup is unavailable.
            }
            return resolved;
          };

          let activeDisputeHash = "";
          try {
            const currentBlock = await provider.getBlockNumber();
            const deployBlock = Number(process.env.NEXT_PUBLIC_DEPLOY_BLOCK || 10823551);
            const logs = await contract.queryFilter(
              contract.filters.ContributionDisputed(projectId),
              Math.max(deployBlock, 0),
              currentBlock
            ) as DisputeEventLog[];
            const latest = logs.sort((a, b) => {
              const blockDelta = Number(a.blockNumber ?? 0) - Number(b.blockNumber ?? 0);
              if (blockDelta !== 0) return blockDelta;
              return Number(a.index ?? a.logIndex ?? 0) - Number(b.index ?? b.logIndex ?? 0);
            }).at(-1);
            activeDisputeHash = latest?.args?.contributionHash ?? "";
          } catch {
            activeDisputeHash = "";
          }

          const activeContribution = activeDisputeHash
            ? storedContributions.find(contribution =>
              getContributionHash(projectId, contribution.contributor, contribution.timestamp) === activeDisputeHash
            )
            : null;

          if (activeContribution) {
            identity = await resolveContributionIdentity(activeContribution);
          } else {
            const newestFirst = [...storedContributions].sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
            for (const contribution of newestFirst) {
              const isContributionDisputed = await contract.checkIfDisputed(
                projectId,
                contribution.contributor,
                contribution.timestamp
              );
              if (isContributionDisputed) {
                identity = await resolveContributionIdentity(contribution);
                break;
              }
            }
          }
        } catch {
          identity = UNKNOWN_DISPUTED_IDENTITY;
        }
        setDisputedIdentity(identity);
      } else {
        setDisputedIdentity(UNKNOWN_DISPUTED_IDENTITY);
      }

      const reasonContract = new ethers.Contract(CONTRACT_ADDRESS, DISPUTE_REASON_ABI, provider);
      let reason = "";
      try {
        reason = await reasonContract.projectDisputeReasons(projectId);
      } catch {
        try {
          reason = await reasonContract.getProjectDisputeReason(projectId);
        } catch {
          reason = "";
        }
      }
      setProjectDisputeReason(reason);

      try {
        const finStatus = await contract.getFinalizationStatus(projectId);
        setFinalizationStatus(finStatus);
      } catch {
        setFinalizationStatus(null);
      }
    } catch (err) {
      const error = err as RpcError;
      if (error?.code === "CALL_EXCEPTION" && typeof error?.message === "string" && error.message.includes("missing revert data")) {
        console.warn("Project-level halt state unavailable on deployed contract version.");
        setIsHalted(false);
        setProjectDisputeReason("");
        setDisputedIdentity(UNKNOWN_DISPUTED_IDENTITY);
        setHaltStateSupported(false);
        setFinalizationStatus(null);
        return;
      }
      console.error("Failed to fetch project halt state:", err);
      setIsHalted(false);
      setProjectDisputeReason("");
      setDisputedIdentity(UNKNOWN_DISPUTED_IDENTITY);
      setHaltStateSupported(true);
    }
  }, [projectId]);

  useEffect(() => {
    const timer = setTimeout(fetchHaltState, 0);
    return () => clearTimeout(timer);
  }, [projectId, fetchHaltState, refreshKey]);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

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

      <div className="app-shell">
        <header style={{ borderBottom:"1px solid var(--rule)", paddingBottom:"24px", marginBottom:"28px" }}>
          <div className="app-header-row" style={{ display:"flex", flexWrap:"wrap", alignItems:"flex-end", justifyContent:"space-between", gap:"16px" }}>
            <div className="app-header-copy">
              <p style={{ fontFamily:"var(--font-geist-mono)", fontSize:"10px", color:"var(--accent)", letterSpacing:"0.2em", textTransform:"uppercase", marginBottom:"6px" }}>Decentralised Ledger Technology</p>
              <h1 className="app-title" style={{ fontFamily:"var(--font-lora)", fontSize:"2rem", fontWeight:600, lineHeight:1.2, color:"var(--ink)", margin:0 }}>Proof-of-Priority System</h1>
              <p style={{ fontFamily:"var(--font-lora)", fontSize:"0.95rem", color:"var(--ink-3)", fontStyle:"italic", marginTop:"4px" }}>Verifiable Authorship Validation in Academic Research</p>
            </div>
            <div className="app-header-network" style={{ borderLeft:"2px solid var(--accent)", paddingLeft:"12px", textAlign:"right" }}>
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
                <div className="workspace-grid" style={{ gridTemplateColumns: isProjectImmutable ? "1fr" : "var(--workspace-cols)" }}>
                  {!isProjectImmutable && (
                    <div className="workspace-sidebar" style={{ display:"flex", flexDirection:"column", gap:"20px" }}>
                      {!haltStateSupported && projectId && (
                      <div style={{ border:"1px solid #FBBF24", borderRadius:"10px", background:"#FEF3C7", color:"#92400E", padding:"16px", lineHeight:1.6 }}>
                        <p style={{ fontFamily:"var(--font-geist-mono)", fontSize:"0.95rem", margin:0, fontWeight:600 }}>Compatibility notice: This deployed contract version does not support project-level arbitration freeze.</p>
                        <p style={{ fontFamily:"var(--font-geist-mono)", fontSize:"0.9rem", margin:"8px 0 0" }}>Contributions and collaborator management remain enabled until the contract is upgraded to the latest AcademicLedger implementation.</p>
                      </div>
                      )}
                      {haltStateSupported && isHalted && (
                      <div style={{ border:"1px solid #E6B8BF", borderRadius:"8px", background:"var(--danger-bg)", color:"var(--ink-2)", padding:"14px 16px", lineHeight:1.45 }}>
                        <p style={{ fontFamily:"var(--font-geist-mono)", fontSize:"10px", letterSpacing:"0.16em", textTransform:"uppercase", color:"var(--danger)", margin:"0 0 8px", fontWeight:700 }}>
                          Arbitration Notice
                        </p>
                        <p style={{ fontFamily:"var(--font-geist-sans)", fontSize:"14px", margin:0, fontWeight:500 }}>
                          Contribution logged by <strong style={{ color:"var(--ink)", fontWeight:700 }}>{disputedIdentity}</strong> is under institutional arbitration.
                        </p>
                        <p style={{ fontFamily:"var(--font-geist-sans)", fontSize:"13px", color:"var(--ink-3)", margin:"6px 0 0" }}>Contributions and collaborator management are frozen until arbitration is resolved.</p>
                        {projectDisputeReason && (
                          <div style={{ borderTop:"1px solid #EAC8CD", marginTop:"12px", paddingTop:"10px" }}>
                            <p style={{ fontFamily:"var(--font-geist-mono)", fontSize:"10px", letterSpacing:"0.12em", textTransform:"uppercase", color:"var(--ink-4)", margin:"0 0 4px", fontWeight:700 }}>Reason</p>
                            <p style={{ fontFamily:"var(--font-geist-sans)", fontSize:"13px", color:"var(--ink-2)", margin:0, lineHeight:1.5 }}>
                              {projectDisputeReason}
                            </p>
                          </div>
                        )}
                      </div>
                      )}
                      <>
                        <LogContributionForm
                          contractAddress={CONTRACT_ADDRESS}
                          contractABI={AcademicLedgerABI.abi}
                          projectId={projectId}
                          isHalted={isHalted}
                          disputedIdentity={disputedIdentity}
                          isFinalizationActive={isFinalizationActive}
                          onSuccess={(confirmed: ConfirmedContribution) => {
                            setConfirmedContribution(confirmed);
                            setRefreshKey(k => k + 1);
                          }}
                        />
                        <ManageCollaborators
                          contractAddress={CONTRACT_ADDRESS}
                          contractABI={AcademicLedgerABI.abi}
                          projectId={projectId}
                          isHalted={isHalted}
                          disputedIdentity={disputedIdentity}
                          disputeReason={projectDisputeReason}
                          onResolved={fetchHaltState}
                        />
                      </>
                    </div>
                  )}
                  <ContributionTimeline
                    contractAddress={CONTRACT_ADDRESS}
                    contractABI={AcademicLedgerABI.abi}
                    projectId={projectId}
                    readOnlyRpcUrl={RPC_URL}
                    refreshKey={refreshKey}
                    confirmedContribution={confirmedContribution}
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
