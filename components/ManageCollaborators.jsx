"use client";
/** * components/ManageCollaborators.jsx — v3 
 * * NEW: Transfer Project Ownership section (Danger Zone). 
 * Visible only to the current project admin. 
 * Uses projectAdmins mapping and transferProjectAdmin() function. 
 */
import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import toast from "react-hot-toast";
import { useWallet } from "@/context/WalletContext";

function isValidAddress(addr) { return /^0x[0-9a-fA-F]{40}$/.test(addr); }
function truncate(addr) { return addr ? `${addr.slice(0,6)}...${addr.slice(-4)}` : "—"; }

export default function ManageCollaborators({ contractAddress, contractABI, projectId }) {
  const { address } = useWallet();
  const [isAdmin,       setIsAdmin]       = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [adminAddress,  setAdminAddress]  = useState("");
  
  // Authorize collaborator state
  const [collabAddr,    setCollabAddr]    = useState("");
  const [collabError,   setCollabError]   = useState("");
  const [authorizing,   setAuthorizing]   = useState(false);
  const [authorized,    setAuthorized]    = useState([]);
  
  // Transfer ownership state
  const [transferAddr,  setTransferAddr]  = useState("");
  const [transferError, setTransferError] = useState("");
  const [transferring,  setTransferring]  = useState(false);
  const [showDanger,    setShowDanger]    = useState(false);
  const [transferred,   setTransferred]   = useState(false); // hides panel after transfer

  // ── Check if connected wallet is project admin ────────────────────────────
  const checkAdmin = useCallback(async () => {
    if (!contractAddress || !contractABI || !projectId || !address) {
      setCheckingAdmin(false); return;
    }
    setCheckingAdmin(true);
    try {
      const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_RPC_URL);
      const contract = new ethers.Contract(contractAddress, contractABI, provider);
      const admin    = await contract.projectAdmins(projectId);
      setAdminAddress(admin);
      setIsAdmin(admin.toLowerCase() === address.toLowerCase());
    } catch { setIsAdmin(false); }
    finally  { setCheckingAdmin(false); }
  }, [contractAddress, contractABI, projectId, address]);

  useEffect(() => { checkAdmin(); }, [checkAdmin]);

  // Re-check when MetaMask switches account
  useEffect(() => {
    if (!window.ethereum) return;
    window.ethereum.on("accountsChanged", checkAdmin);
    return () => window.ethereum.removeListener("accountsChanged", checkAdmin);
  }, [checkAdmin]);

  // ── Authorize collaborator ────────────────────────────────────────────────
  const handleAuthorize = async (e) => {
    e.preventDefault();
    if (!collabAddr)               return setCollabError("Address is required.");
    if (!isValidAddress(collabAddr)) return setCollabError("Invalid Ethereum address.");
    setCollabError("");
    
    const toastId = toast.loading("Confirm in MetaMask…");
    setAuthorizing(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer   = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, contractABI, signer);
      const tx = await contract.authorizeCollaborator(projectId, collabAddr);
      
      toast.loading("Transaction pending…", { id: toastId });
      await tx.wait(1);
      
      toast.success("Collaborator authorized.", { id: toastId });
      setAuthorized(prev => [{ address: collabAddr, txHash: tx.hash }, ...prev]);
      setCollabAddr("");
    } catch (err) {
      const msg = err?.code === 4001 ? "Rejected in MetaMask." : err?.message ?? "Transaction failed.";
      toast.error(msg, { id: toastId });
    } finally { setAuthorizing(false); }
  };

  // ── Transfer project admin ────────────────────────────────────────────────
  const handleTransfer = async (e) => {
    e.preventDefault();
    if (!transferAddr)               return setTransferError("Address is required.");
    if (!isValidAddress(transferAddr)) return setTransferError("Invalid Ethereum address.");
    if (transferAddr.toLowerCase() === address?.toLowerCase())
      return setTransferError("You are already the admin.");
    setTransferError("");
    
    const toastId = toast.loading("Confirm in MetaMask…");
    setTransferring(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer   = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, contractABI, signer);
      const tx = await contract.transferProjectAdmin(projectId, transferAddr);
      
      toast.loading("Transferring ownership on-chain…", { id: toastId });
      await tx.wait(1);
      
      toast.success("Project ownership transferred.", { id: toastId });
      // Immediately hide the admin panel from the old admin
      setIsAdmin(false);
      setTransferred(true);
    } catch (err) {
      const msg = err?.code === 4001 ? "Rejected in MetaMask." : err?.message ?? "Transaction failed.";
      toast.error(msg, { id: toastId });
    } finally { setTransferring(false); }
  };

  // ── States ────────────────────────────────────────────────────────────────
  if (checkingAdmin) return (
    <div style={{ border:"1px solid var(--rule)", borderRadius:"8px", padding:"16px 20px", background:"var(--paper)", display:"flex", alignItems:"center", gap:"8px" }}>
      <svg style={{ animation:"spin 1s linear infinite", width:"13px", height:"13px", flexShrink:0 }} fill="none" viewBox="0 0 24 24">
        <circle style={{ opacity:0.2 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
        <path style={{ opacity:0.8 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
      </svg>
      <span style={{ fontFamily:"var(--font-geist-mono)", fontSize:"11px", color:"var(--ink-4)" }}>Verifying admin rights…</span>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (!isAdmin || transferred) return (
    <div style={{ border:"1px solid var(--rule)", borderRadius:"8px", padding:"16px 20px", background:"var(--paper-2)", display:"flex", alignItems:"center", gap:"10px" }}>
      <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color:"var(--ink-4)", flexShrink:0 }}>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
      </svg>
      <div>
        <p style={{ fontFamily:"var(--font-geist-mono)", fontSize:"11px", fontWeight:600, color:"var(--ink-3)" }}>
          {transferred ? "Ownership transferred — admin panel hidden." : "Admin panel — requires project admin rights."}
        </p>
        {!transferred && adminAddress && (
          <p style={{ fontFamily:"var(--font-geist-mono)", fontSize:"10px", color:"var(--ink-4)", marginTop:"2px" }}>
            Admin: {truncate(adminAddress)}
          </p>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div style={{ border:"1px solid var(--rule)", borderRadius:"8px", overflow:"hidden", background:"var(--paper)" }}>
        <div style={{ height:"2px", background:"var(--warning)" }} />
        <div style={{ padding:"20px 22px" }}>
          
          {/* Header */}
          <div style={{ paddingBottom:"12px", borderBottom:"1px solid var(--rule-light)", marginBottom:"16px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"3px" }}>
              <p style={{ fontFamily:"var(--font-geist-mono)", fontSize:"10px", color:"var(--warning)", textTransform:"uppercase", letterSpacing:"0.18em" }}>Owner Panel</p>
              <span style={{ fontFamily:"var(--font-geist-mono)", fontSize:"9px", fontWeight:700, background:"var(--warning-bg)", color:"var(--warning)", border:"1px solid #E8D088", padding:"1px 6px", borderRadius:"3px", letterSpacing:"0.08em" }}>ADMIN</span>
            </div>
            <h2 style={{ fontFamily:"var(--font-lora)", fontSize:"1.15rem", fontWeight:600, color:"var(--ink)", marginBottom:"3px" }}>Manage Collaborators</h2>
            <p style={{ fontFamily:"var(--font-geist-mono)", fontSize:"10px", color:"var(--ink-4)" }}>
              Project: <span style={{ color:"var(--ink-2)", fontWeight:600 }}>{projectId}</span>
              &nbsp;·&nbsp; Admin: <span style={{ color:"var(--ink-2)" }}>{truncate(adminAddress)}</span>
            </p>
          </div>

          {/* Authorize form */}
          <form onSubmit={handleAuthorize} style={{ display:"flex", flexDirection:"column", gap:"12px", marginBottom:"16px" }}>
            <div>
              <label style={{ fontFamily:"var(--font-geist-mono)", fontSize:"10px", color:"var(--ink-4)", textTransform:"uppercase", letterSpacing:"0.15em", display:"block", marginBottom:"6px" }}>Authorize Wallet Address</label>
              <input type="text" value={collabAddr} onChange={e => { setCollabAddr(e.target.value); setCollabError(""); }} disabled={authorizing}
                placeholder="0x0000000000000000000000000000000000000000" spellCheck={false}
                style={{ width:"100%", padding:"9px 12px", borderRadius:"6px", border:`1px solid ${collabError ? "var(--danger)" : collabAddr && isValidAddress(collabAddr) ? "#A8D8BE" : "var(--rule)"}`, background:"var(--paper)", color:"var(--ink)", fontFamily:"var(--font-geist-mono)", fontSize:"12px", outline:"none", boxSizing:"border-box" }} />
              {collabError && <p style={{ fontSize:"11px", color:"var(--danger)", marginTop:"4px", fontFamily:"var(--font-geist-mono)" }}>✕ {collabError}</p>}
              {!collabError && collabAddr && isValidAddress(collabAddr) && <p style={{ fontSize:"11px", color:"var(--accent)", marginTop:"4px", fontFamily:"var(--font-geist-mono)" }}>✓ Valid address</p>}
            </div>
            <button type="submit" disabled={authorizing || !!collabError || !collabAddr}
              style={{ width:"100%", padding:"11px", borderRadius:"6px", border:"none", background: authorizing || !collabAddr || collabError ? "var(--paper-3)" : "var(--warning)", color: authorizing || !collabAddr || collabError ? "var(--ink-4)" : "#fff", fontSize:"13px", fontWeight:600, cursor: authorizing || !collabAddr || collabError ? "not-allowed" : "pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:"8px" }}>
              {authorizing ? (
                <>
                  <svg style={{ animation:"spin 1s linear infinite", width:"12px", height:"12px" }} fill="none" viewBox="0 0 24 24"><circle style={{ opacity:0.2 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/><path style={{ opacity:0.8 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                  Processing…
                </>
              ) : "Authorize Collaborator"}
            </button>
          </form>

          {/* Recent authorizations */}
          {authorized.length > 0 && (
            <div style={{ marginBottom:"16px" }}>
              <p style={{ fontFamily:"var(--font-geist-mono)", fontSize:"9px", color:"var(--ink-4)", textTransform:"uppercase", letterSpacing:"0.15em", marginBottom:"8px" }}>Authorized this session</p>
              <div style={{ display:"flex", flexDirection:"column", gap:"6px" }}>
                {authorized.map((item, i) => (
                  <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", background:"var(--paper-2)", border:"1px solid var(--rule-light)", borderRadius:"4px", padding:"6px 10px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
                      <div style={{ width:"5px", height:"5px", borderRadius:"50%", background:"var(--accent)", flexShrink:0 }} />
                      <span style={{ fontFamily:"var(--font-geist-mono)", fontSize:"11px", color:"var(--ink-3)" }}>{truncate(item.address)}</span>
                    </div>
                    <span style={{ fontFamily:"var(--font-geist-mono)", fontSize:"9px", color:"var(--ink-4)" }}>tx/{item.txHash.slice(0,8)}…</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Danger Zone: Transfer Ownership ──────────────────────────── */}
          <div style={{ borderTop:"1px solid var(--rule-light)", paddingTop:"14px" }}>
            <button
              onClick={() => setShowDanger(d => !d)}
              style={{ display:"flex", alignItems:"center", gap:"6px", background:"none", border:"none", cursor:"pointer", padding:0, marginBottom: showDanger ? "12px" : 0 }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color:"var(--danger)", flexShrink:0 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
              </svg>
              <span style={{ fontFamily:"var(--font-geist-mono)", fontSize:"10px", color:"var(--danger)", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.15em" }}>
                Transfer Project Ownership {showDanger ? "▲" : "▼"}
              </span>
            </button>

            {showDanger && (
              <div style={{ background:"var(--danger-bg)", border:"1px solid #F5C6CB", borderRadius:"6px", padding:"14px 16px" }}>
                <p style={{ fontSize:"12px", color:"var(--danger)", lineHeight:1.6, marginBottom:"12px", fontFamily:"var(--font-geist-mono)" }}>
                  ⚠ This action is irreversible. The recipient wallet will become the project admin.
                  You will lose admin rights immediately upon confirmation.
                </p>
                <form onSubmit={handleTransfer} style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
                  <input type="text" value={transferAddr} onChange={e => { setTransferAddr(e.target.value); setTransferError(""); }} disabled={transferring}
                    placeholder="New admin wallet address (0x...)" spellCheck={false}
                    style={{ width:"100%", padding:"9px 12px", borderRadius:"6px", border:`1px solid ${transferError ? "var(--danger)" : "var(--rule)"}`, background:"var(--paper)", color:"var(--ink)", fontFamily:"var(--font-geist-mono)", fontSize:"12px", outline:"none", boxSizing:"border-box" }} />
                  {transferError && <p style={{ fontSize:"11px", color:"var(--danger)", fontFamily:"var(--font-geist-mono)" }}>✕ {transferError}</p>}
                  <button type="submit" disabled={transferring || !transferAddr}
                    style={{ width:"100%", padding:"10px", borderRadius:"6px", border:"1px solid var(--danger)", background:"var(--paper)", color:"var(--danger)", fontSize:"12px", fontWeight:700, cursor: transferring || !transferAddr ? "not-allowed" : "pointer", opacity: transferring || !transferAddr ? 0.5 : 1, display:"flex", alignItems:"center", justifyContent:"center", gap:"8px" }}>
                    {transferring ? (
                      <>
                        <svg style={{ animation:"spin 1s linear infinite", width:"12px", height:"12px" }} fill="none" viewBox="0 0 24 24"><circle style={{ opacity:0.2 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/><path style={{ opacity:0.8 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                        Transferring…
                      </>
                    ) : "Transfer Ownership"}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </>
  );
}