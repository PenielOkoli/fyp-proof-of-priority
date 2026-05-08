"use client";
import { useState, useCallback } from "react";
import { ethers } from "ethers";
import toast from "react-hot-toast";
import { useWallet } from "@/context/WalletContext";

const CREDIT_ROLES = [
  "Conceptualization","Data Curation","Formal Analysis","Funding Acquisition",
  "Investigation","Methodology","Project Administration","Resources","Software",
  "Supervision","Validation","Visualization",
  "Writing \u2013 Original Draft","Writing \u2013 Review & Editing",
];

const PHASE = { IDLE:"idle", UPLOADING_IPFS:"uploading_ipfs", AWAITING_WALLET:"awaiting_wallet", MINING:"mining", SUCCESS:"success", ERROR:"error" };
const PHASE_LABEL = { uploading_ipfs:"Uploading to IPFS\u2026", awaiting_wallet:"Confirm in MetaMask\u2026", mining:"Awaiting confirmation\u2026" };

function truncate(addr) { return addr ? `${addr.slice(0,6)}...${addr.slice(-4)}` : ""; }

export default function LogContributionForm({ contractAddress, contractABI, projectId, onSuccess }) {
  const { address } = useWallet();
  const [file,     setFile]     = useState(null);
  const [role,     setRole]     = useState("Conceptualization");
  const [phase,    setPhase]    = useState(PHASE.IDLE);
  const [errorMsg, setErrorMsg] = useState("");
  const [txHash,   setTxHash]   = useState("");
  const [cid,      setCid]      = useState("");
  const [dragging, setDragging] = useState(false);
  const isBusy = ["uploading_ipfs","awaiting_wallet","mining"].includes(phase);

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files?.[0]; if (f) setFile(f);
  }, []);

  const resetForm = () => { setFile(null); setRole("Conceptualization"); setPhase(PHASE.IDLE); setErrorMsg(""); setTxHash(""); setCid(""); };

  const handleSubmit = async (e) => {
    e.preventDefault(); setErrorMsg("");
    if (!file)            return setErrorMsg("Please select a research artifact file.");
    if (!contractAddress) return setErrorMsg("Contract address is not configured.");
    if (!contractABI)     return setErrorMsg("Contract ABI is not configured.");

    const toastId = toast.loading("Uploading to IPFS\u2026");
    try {
      setPhase(PHASE.UPLOADING_IPFS);
      const fd = new FormData(); fd.append("file", file); fd.append("label", `${role} \u2014 ${projectId}`);
      const res = await fetch("/api/upload", { method:"POST", body:fd });
      if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.message ?? `Upload failed (${res.status})`); }
      const { cid: uploadedCid } = await res.json(); setCid(uploadedCid);

      setPhase(PHASE.AWAITING_WALLET); toast.loading("Confirm in MetaMask\u2026", { id:toastId });
      if (!window.ethereum) throw new Error("MetaMask not found.");
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer   = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, contractABI, signer);
      const tx = await contract.logContribution(projectId, uploadedCid, role);
      setTxHash(tx.hash);

      setPhase(PHASE.MINING); toast.loading("Transaction pending\u2026", { id:toastId });
      await tx.wait(1);
      setPhase(PHASE.SUCCESS); toast.success("Contribution logged on-chain.", { id:toastId });
      if (typeof onSuccess === "function") onSuccess();
    } catch (err) {
      const msg = err?.code === 4001 ? "Transaction rejected in MetaMask." : err?.message ?? "Unknown error.";
      setErrorMsg(msg); setPhase(PHASE.ERROR); toast.error(msg, { id:toastId });
    }
  };

  if (phase === PHASE.SUCCESS) return (
    <div style={{ border:"1px solid var(--rule)", borderRadius:"8px", overflow:"hidden", background:"var(--paper)" }}>
      <div style={{ height:"2px", background:"var(--accent)" }} />
      <div style={{ padding:"22px" }}>
        <p style={{ fontFamily:"var(--font-geist-mono)", fontSize:"10px", color:"var(--accent)", textTransform:"uppercase", letterSpacing:"0.18em", marginBottom:"6px" }}>Record Logged</p>
        <h2 style={{ fontFamily:"var(--font-lora)", fontSize:"1.15rem", fontWeight:600, color:"var(--ink)", marginBottom:"10px" }}>Contribution Accepted</h2>
        <p style={{ fontSize:"13px", color:"var(--ink-3)", lineHeight:1.6, marginBottom:"14px" }}>Immutably recorded on the Sepolia blockchain.</p>
        <div style={{ background:"var(--paper-2)", border:"1px solid var(--rule-light)", borderRadius:"4px", padding:"10px 14px", marginBottom:"10px" }}>
          <p style={{ fontFamily:"var(--font-geist-mono)", fontSize:"9px", color:"var(--ink-4)", textTransform:"uppercase", letterSpacing:"0.15em", marginBottom:"4px" }}>IPFS Content ID</p>
          <a href={`https://gateway.pinata.cloud/ipfs/${cid}`} target="_blank" rel="noopener noreferrer" style={{ fontFamily:"var(--font-geist-mono)", fontSize:"11px", color:"var(--accent)", wordBreak:"break-all" }}>{cid}</a>
        </div>
        {txHash && (
          <div style={{ background:"var(--paper-2)", border:"1px solid var(--rule-light)", borderRadius:"4px", padding:"10px 14px", marginBottom:"14px" }}>
            <p style={{ fontFamily:"var(--font-geist-mono)", fontSize:"9px", color:"var(--ink-4)", textTransform:"uppercase", letterSpacing:"0.15em", marginBottom:"4px" }}>Transaction Hash</p>
            <p style={{ fontFamily:"var(--font-geist-mono)", fontSize:"11px", color:"var(--ink-3)", wordBreak:"break-all" }}>{txHash}</p>
          </div>
        )}
        <button onClick={resetForm} style={{ width:"100%", padding:"10px", borderRadius:"6px", border:"1px solid var(--rule)", background:"var(--paper)", color:"var(--ink-3)", fontSize:"13px", cursor:"pointer" }}>Log another contribution</button>
      </div>
    </div>
  );

  return (
    <div style={{ border:"1px solid var(--rule)", borderRadius:"8px", overflow:"hidden", background:"var(--paper)" }}>
      <div style={{ height:"2px", background: isBusy ? "var(--indigo)" : "var(--accent)", transition:"background 0.4s" }} />
      <div style={{ padding:"22px" }}>
        <div style={{ paddingBottom:"14px", borderBottom:"1px solid var(--rule-light)", marginBottom:"16px" }}>
          <p style={{ fontFamily:"var(--font-geist-mono)", fontSize:"10px", color:"var(--accent)", textTransform:"uppercase", letterSpacing:"0.18em", marginBottom:"4px" }}>Submit Record</p>
          <h2 style={{ fontFamily:"var(--font-lora)", fontSize:"1.15rem", fontWeight:600, color:"var(--ink)", marginBottom:"6px" }}>Log Contribution</h2>
          <p style={{ fontFamily:"var(--font-geist-mono)", fontSize:"10px", color:"var(--ink-4)" }}>
            Identity: <span style={{ color:"var(--ink-2)", fontWeight:600 }}>{truncate(address)}</span>
            &nbsp;&middot;&nbsp; Project: <span style={{ color:"var(--ink-2)", fontWeight:600 }}>{projectId}</span>
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display:"flex", flexDirection:"column", gap:"14px" }}>
          <div>
            <label style={{ fontFamily:"var(--font-geist-mono)", fontSize:"10px", color:"var(--ink-4)", textTransform:"uppercase", letterSpacing:"0.15em", display:"block", marginBottom:"6px" }}>Research Artifact</label>
            <input type="file" onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f); }} disabled={isBusy} accept="*/*"
              style={{ display:"block", width:"100%", color:"var(--ink-3)", fontFamily:"var(--font-geist-mono)", fontSize:"12px" }} />
            <div onDragOver={e=>{ e.preventDefault(); setDragging(true); }} onDragLeave={()=>setDragging(false)} onDrop={handleDrop}
              style={{ marginTop:"8px", height:"46px", border:`1px dashed ${dragging?"var(--accent)":"var(--rule)"}`, borderRadius:"6px", background: dragging?"var(--accent-bg)":"var(--paper-2)", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"var(--font-geist-mono)", fontSize:"11px", color: file?"var(--accent)":"var(--ink-4)", transition:"all 0.15s" }}>
              {file ? `\u2713  ${file.name}  (${(file.size/1024).toFixed(1)} KB)` : "or drag & drop here"}
            </div>
          </div>

          <div>
            <label htmlFor="credit-role" style={{ fontFamily:"var(--font-geist-mono)", fontSize:"10px", color:"var(--ink-4)", textTransform:"uppercase", letterSpacing:"0.15em", display:"block", marginBottom:"6px" }}>CRediT Taxonomy Role</label>
            <select id="credit-role" value={role} onChange={e=>setRole(e.target.value)} disabled={isBusy}
              style={{ width:"100%", padding:"9px 32px 9px 12px", borderRadius:"6px", border:"1px solid var(--rule)", background:"var(--paper)", color:"var(--ink)", fontFamily:"var(--font-geist-mono)", fontSize:"12px", appearance:"none", backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239A9A90' stroke-width='2'%3E%3Cpath d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`, backgroundRepeat:"no-repeat", backgroundPosition:"right 12px center" }}>
              {CREDIT_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {(phase === PHASE.ERROR || errorMsg) && (
            <div style={{ background:"var(--danger-bg)", border:"1px solid #F5C6CB", color:"var(--danger)", borderRadius:"6px", padding:"9px 12px", fontSize:"12px", display:"flex", gap:"8px" }}>
              <span>\u2715</span><span style={{ lineHeight:1.5 }}>{errorMsg}</span>
            </div>
          )}

          {isBusy && (
            <div style={{ background:"var(--indigo-bg)", border:"1px solid #C5CAE9", color:"var(--indigo)", borderRadius:"6px", padding:"9px 12px", fontSize:"12px", display:"flex", alignItems:"center", gap:"10px" }}>
              <svg style={{ animation:"spin 1s linear infinite", width:"13px", height:"13px", flexShrink:0 }} fill="none" viewBox="0 0 24 24">
                <circle style={{ opacity:0.2 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                <path style={{ opacity:0.8 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              <span style={{ fontFamily:"var(--font-geist-mono)" }}>{PHASE_LABEL[phase]}</span>
            </div>
          )}

          <button type="submit" disabled={isBusy}
            style={{ width:"100%", padding:"12px", borderRadius:"6px", border:"none", background: isBusy?"var(--paper-3)":"var(--accent)", color: isBusy?"var(--ink-4)":"#fff", fontSize:"13px", fontWeight:600, letterSpacing:"0.04em", cursor: isBusy?"not-allowed":"pointer", pointerEvents: isBusy?"none":"auto", transition:"background 0.2s" }}>
            {isBusy ? PHASE_LABEL[phase] : "Upload & Log Contribution"}
          </button>
          <p style={{ textAlign:"center", fontFamily:"var(--font-geist-mono)", fontSize:"10px", color:"var(--ink-4)", lineHeight:1.6 }}>
            Wallet address permanently associated with this record. No scoring applied.
          </p>
        </form>
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );
}
