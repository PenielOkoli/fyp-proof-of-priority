"use client";
import { useState } from "react";
import { ethers } from "ethers";
import toast from "react-hot-toast";
import { useWallet } from "@/context/WalletContext";
import { getFriendlyError } from "@/utils/errorFormatter";

const ORCID_RE = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;

export default function RegisterProfileModal({ contractAddress, contractABI }) {
  const { onProfileRegistered } = useWallet();
  const [name,         setName]         = useState("");
  const [orcid,        setOrcid]        = useState("");
  const [orcidTouched, setOrcidTouched] = useState(false);
  const [submitting,   setSubmitting]   = useState(false);

  const orcidValid = ORCID_RE.test(orcid.trim());
  const nameValid  = name.trim().length >= 2;
  const canSubmit  = nameValid && orcidValid && !submitting;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    const toastId = toast.loading("Confirm in MetaMask\u2026");
    setSubmitting(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer   = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, contractABI, signer);
      const tx = await contract.registerProfile(name.trim(), orcid.trim());
      toast.loading("Registering profile on-chain\u2026", { id: toastId });
      await tx.wait(1);
      toast.success("Profile registered.", { id: toastId });
      onProfileRegistered(name.trim(), orcid.trim());
    } catch (err) {
      const msg = err?.code === 4001 ? "Transaction rejected." : getFriendlyError(err, "Registration failed.");
      toast.error(msg, { id: toastId });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ position:"fixed", inset:0, zIndex:200, background:"rgba(26,26,24,0.55)", backdropFilter:"blur(4px)", display:"flex", alignItems:"center", justifyContent:"center", padding:"20px" }}>
      <div style={{ background:"var(--paper)", border:"1px solid var(--rule)", borderRadius:"12px", width:"100%", maxWidth:"460px", overflow:"hidden", boxShadow:"0 8px 40px rgba(0,0,0,0.18)" }}>
        <div style={{ height:"3px", background:"var(--accent)" }} />
        <div style={{ padding:"28px 32px" }}>
          <div style={{ marginBottom:"20px" }}>
            <p style={{ fontFamily:"var(--font-geist-mono)", fontSize:"10px", color:"var(--accent)", textTransform:"uppercase", letterSpacing:"0.2em", marginBottom:"6px" }}>Identity Registry</p>
            <h2 style={{ fontFamily:"var(--font-lora)", fontSize:"1.4rem", fontWeight:600, color:"var(--ink)", marginBottom:"8px" }}>Complete Your Profile</h2>
            <p style={{ fontSize:"13px", color:"var(--ink-3)", lineHeight:1.65 }}>
              Your wallet is not yet registered in the on-chain identity registry. Register your name and ORCID to link a human-readable identity to your contributions.
            </p>
          </div>

          <div style={{ background:"var(--accent-bg)", border:"1px solid #A8D8BE", borderRadius:"6px", padding:"10px 14px", marginBottom:"20px" }}>
            <p style={{ fontFamily:"var(--font-geist-mono)", fontSize:"11px", color:"var(--accent-2)", lineHeight:1.6 }}>
              This writes your profile to the Ethereum blockchain — permanently linking your wallet to your academic identity. Gas fees apply.
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display:"flex", flexDirection:"column", gap:"16px" }}>
            <div>
              <label style={{ fontFamily:"var(--font-geist-mono)", fontSize:"10px", color:"var(--ink-4)", textTransform:"uppercase", letterSpacing:"0.15em", display:"block", marginBottom:"6px" }}>Full Name</label>
              <input type="text" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Dr. Ngozi Adeyemi" disabled={submitting}
                style={{ width:"100%", padding:"10px 14px", borderRadius:"6px", border:`1px solid ${name && !nameValid ? "var(--danger)" : "var(--rule)"}`, background:"var(--paper)", color:"var(--ink)", fontFamily:"var(--font-geist-sans)", fontSize:"14px", outline:"none", boxSizing:"border-box" }} />
              {name && !nameValid && <p style={{ fontSize:"11px", color:"var(--danger)", marginTop:"4px", fontFamily:"var(--font-geist-mono)" }}>Minimum 2 characters.</p>}
            </div>

            <div>
              <label style={{ fontFamily:"var(--font-geist-mono)", fontSize:"10px", color:"var(--ink-4)", textTransform:"uppercase", letterSpacing:"0.15em", display:"block", marginBottom:"6px" }}>ORCID iD</label>
              <input type="text" value={orcid} onChange={e=>{ setOrcid(e.target.value); setOrcidTouched(true); }} placeholder="0000-0002-1825-0097" disabled={submitting} maxLength={19}
                style={{ width:"100%", padding:"10px 14px", borderRadius:"6px", border:`1px solid ${orcidTouched && !orcidValid ? "var(--danger)" : orcidValid ? "#A8D8BE" : "var(--rule)"}`, background:"var(--paper)", color:"var(--ink)", fontFamily:"var(--font-geist-mono)", fontSize:"14px", outline:"none", letterSpacing:"0.05em", boxSizing:"border-box" }} />
              {orcidTouched && !orcidValid
                ? <p style={{ fontSize:"11px", color:"var(--danger)", marginTop:"4px", fontFamily:"var(--font-geist-mono)" }}>Format: 0000-0002-1825-0097</p>
                : orcidValid
                  ? <p style={{ fontSize:"11px", color:"var(--accent)", marginTop:"4px", fontFamily:"var(--font-geist-mono)" }}>\u2713 Valid ORCID format</p>
                  : <p style={{ fontSize:"11px", color:"var(--ink-4)", marginTop:"4px", fontFamily:"var(--font-geist-mono)" }}>Find yours at <a href="https://orcid.org" target="_blank" rel="noopener noreferrer" style={{ color:"var(--accent)" }}>orcid.org</a></p>
              }
            </div>

            <button type="submit" disabled={!canSubmit}
              style={{ width:"100%", padding:"13px", borderRadius:"6px", border:"none", background:!canSubmit?"var(--paper-3)":"var(--accent)", color:!canSubmit?"var(--ink-4)":"#fff", fontSize:"13px", fontWeight:600, letterSpacing:"0.05em", cursor:!canSubmit?"not-allowed":"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:"8px" }}>
              {submitting ? (
                <>
                  <svg style={{ animation:"spin 1s linear infinite", width:"13px", height:"13px" }} fill="none" viewBox="0 0 24 24">
                    <circle style={{ opacity:0.2 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                    <path style={{ opacity:0.8 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Registering on-chain\u2026
                </>
              ) : "Register on-chain"}
            </button>
            <p style={{ textAlign:"center", fontFamily:"var(--font-geist-mono)", fontSize:"10px", color:"var(--ink-4)", lineHeight:1.6 }}>
              You can update your profile at any time. Your original registration timestamp is preserved.
            </p>
          </form>
        </div>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
