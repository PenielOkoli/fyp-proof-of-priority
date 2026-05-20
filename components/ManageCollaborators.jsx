"use client";
/**
 * components/ManageCollaborators.jsx — v4
 *
 * NEW: Collaborator Roster section.
 * Fetches getProjectCollaborators(), then resolves each address against
 * researcherProfiles for name/ORCID. Filters out revoked addresses.
 * Highlights the project admin in the list.
 */
import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import toast from "react-hot-toast";
import { useWallet } from "@/context/WalletContext";
import { getFriendlyError } from "@/utils/errorFormatter";

function isValidAddress(addr) { return /^0x[0-9a-fA-F]{40}$/.test(addr); }
function truncate(addr) { return addr ? `${addr.slice(0,6)}...${addr.slice(-4)}` : "—"; }

export default function ManageCollaborators({ contractAddress, contractABI, projectId, isHalted = false, disputeReason = "", onResolved }) {
  const { address } = useWallet();

  const [isAdmin,        setIsAdmin]        = useState(false);
  const [resolving,     setResolving]     = useState(false);
  const [checkingAdmin,  setCheckingAdmin]  = useState(true);
  const [adminAddress,   setAdminAddress]   = useState("");

  // Authorize state
  const [collabAddr,     setCollabAddr]     = useState("");
  const [collabError,    setCollabError]    = useState("");
  const [authorizing,    setAuthorizing]    = useState(false);

  // Roster state
  const [roster,         setRoster]         = useState([]);
  const [rosterLoading,  setRosterLoading]  = useState(false);
  const [rosterError,    setRosterError]    = useState("");

  // Transfer ownership state
  const [transferAddr,   setTransferAddr]   = useState("");
  const [transferError,  setTransferError]  = useState("");
  const [transferring,   setTransferring]   = useState(false);
  const [showDanger,     setShowDanger]     = useState(false);
  const [transferred,    setTransferred]    = useState(false);

  // ── Fetch roster ──────────────────────────────────────────────────────────
  const fetchRoster = useCallback(async (adminAddr) => {
    if (!contractAddress || !contractABI || !projectId) return;
    setRosterLoading(true);
    setRosterError("");
    try {
      const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_RPC_URL);
      const contract = new ethers.Contract(contractAddress, contractABI, provider);

      // 1. Get all addresses ever pushed to the roster
      let addresses;
      try {
        addresses = await contract.getProjectCollaborators(projectId);
      } catch (err) {
        const errMsg = getFriendlyError(err, "Could not fetch collaborator roster from contract.");
        setRosterError(errMsg);
        console.error("getProjectCollaborators failed:", err);
        setRoster([]);
        return;
      }

      if (!addresses || addresses.length === 0) {
        setRoster([]);
        return;
      }

      // 2. For each address, check if still authorized and fetch profile.
      // Sequential iteration avoids overwhelming the RPC provider.
      const enriched = [];
      let authStatusUnavailable = false;
      let profileLookupUnavailable = false;

      // Helper: fetch profile with a small retry/backoff and increasing timeout
      async function fetchProfileWithRetries(addr, maxRetries = 2, baseTimeout = 5000) {
        for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
          try {
            const profilePromise = contract.getProfile(addr);
            const timeoutMs = baseTimeout * Math.pow(2, attempt);
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Profile fetch timeout")), timeoutMs)
            );
            const p = await Promise.race([profilePromise, timeoutPromise]);
            return p;
          } catch (err) {
            if (err?.code === "CALL_EXCEPTION" || err?.message?.includes("missing revert data")) {
              console.warn(`getProfile not available on this contract; skipping profile lookups.`);
              profileLookupUnavailable = true;
              return null;
            }
            // transient: retry with backoff
            if (attempt < maxRetries) {
              const backoff = 300 * Math.pow(2, attempt);
              await new Promise((r) => setTimeout(r, backoff));
              continue;
            }
            console.warn(`Failed to fetch profile for ${addr}: ${err?.message || err}`);
            return null;
          }
        }
        return null;
      }

      for (let i = 0; i < addresses.length; i += 1) {
        const addr = addresses[i];
        let isAuth = false;
        let profile = null;

        if (!authStatusUnavailable) {
          try {
            isAuth = await contract.authorizedCollaborators(projectId, addr);
          } catch (err) {
            if (err?.code === "CALL_EXCEPTION" || err?.message?.includes("missing revert data")) {
              console.warn(`authorizedCollaborators not available on this contract; skipping auth checks.`);
              authStatusUnavailable = true;
            } else if (err?.code === 429 || err?.message?.includes("compute units")) {
              console.warn(`Rate limited while checking authorization for ${addr}. Retrying later.`);
            } else {
              console.error(`Failed to check authorization for ${addr}:`, err);
            }
            isAuth = false;
          }
        }

        if (!authStatusUnavailable && isAuth && !profileLookupUnavailable) {
          profile = await fetchProfileWithRetries(addr);
        }

        enriched.push({
          address: addr,
          isAuth,
          name: profile?.exists ? profile.name : null,
          orcid: profile?.exists ? profile.orcid : null,
          isAdmin: adminAddr ? addr.toLowerCase() === adminAddr.toLowerCase() : false,
        });

        if (i + 1 < addresses.length) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }

      if (authStatusUnavailable) {
        setRosterError("Could not verify current authorization status on this contract version. Showing roster addresses without authorization filtering.");
        setRoster(enriched.map((entry) => ({ ...entry, isAuth: true })));
      } else {
        setRoster(enriched.filter((e) => e.isAuth));
      }
    } catch (err) {
      const errMsg = getFriendlyError(err, "Failed to load collaborator roster.");
      setRosterError(errMsg);
      console.error("Roster fetch failed:", err);
      setRoster([]);
    } finally {
      setRosterLoading(false);
    }
  }, [contractAddress, contractABI, projectId]);

  // ── Check admin rights ────────────────────────────────────────────────────
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
      await fetchRoster(admin);
    } catch { setIsAdmin(false); }
    finally  { setCheckingAdmin(false); }
  }, [contractAddress, contractABI, projectId, address, fetchRoster]);

  useEffect(() => { checkAdmin(); }, [checkAdmin]);

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
    setAuthorizing(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer   = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, contractABI, signer);
      
      // Check if already authorized
      const isAlreadyAuth = await contract.authorizedCollaborators(projectId, collabAddr);
      if (isAlreadyAuth) {
        toast.error("This wallet has already been authorized as a collaborator.");
        return;
      }
      
      const toastId = toast.loading("Confirm in MetaMask…");
      if (isHalted) {
        throw new Error("Project halted: collaborator management disabled until arbitration is resolved.");
      }
      const tx = await contract.authorizeCollaborator(projectId, collabAddr);
      toast.loading("Transaction pending…", { id: toastId });
      await tx.wait(1);
      toast.success("Collaborator authorized.", { id: toastId });
      setCollabAddr("");
      await fetchRoster(adminAddress); // refresh roster
    } catch (err) {
      const msg = err?.code === 4001 ? "Rejected in MetaMask." : getFriendlyError(err, "Transaction failed.");
      toast.error(msg);
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
      if (isHalted) {
        throw new Error("Project halted: owner transfer disabled until arbitration is resolved.");
      }
      const contract = new ethers.Contract(contractAddress, contractABI, signer);
      const tx = await contract.transferProjectAdmin(projectId, transferAddr);
      toast.loading("Transferring ownership on-chain…", { id: toastId });
      await tx.wait(1);
      toast.success("Project ownership transferred.", { id: toastId });
      setIsAdmin(false);
      setTransferred(true);
    } catch (err) {
      const msg = err?.code === 4001 ? "Rejected in MetaMask." : getFriendlyError(err, "Transaction failed.");
      toast.error(msg, { id: toastId });
    } finally { setTransferring(false); }
  };

  // ── Resolve dispute (ADMIN ONLY) ──────────────────────────────────────────
  const handleResolveDispute = async () => {
    if (!contractAddress || !contractABI || !projectId) return;
    setResolving(true);
    const toastId = toast.loading("Confirm in MetaMask…");
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, contractABI, signer);
      const tx = await contract.resolveDispute(projectId);
      toast.loading("Resolving dispute on-chain…", { id: toastId });
      await tx.wait(1);
      toast.success("Dispute resolved.", { id: toastId });
      if (typeof onResolved === "function") onResolved();
      await fetchRoster(adminAddress);
    } catch (err) {
      const msg = err?.code === 4001 ? "Rejected in MetaMask." : getFriendlyError(err, "Failed to resolve dispute.");
      toast.error(msg, { id: toastId });
    } finally {
      setResolving(false);
    }
  };

  // ── Loading / not admin states ────────────────────────────────────────────
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

  // ── Roster-only view for non-admins ──────────────────────────────────────
  // Even non-admins can see who is on the project
  if (!isAdmin || transferred) return (
    <div style={{ border:"1px solid var(--rule)", borderRadius:"8px", overflow:"hidden", background:"var(--paper)" }}>
      <div style={{ height:"2px", background:"var(--rule)" }} />
      <div style={{ padding:"20px 22px" }}>
        <div style={{ paddingBottom:"12px", borderBottom:"1px solid var(--rule-light)", marginBottom:"14px" }}>
          <p style={{ fontFamily:"var(--font-geist-mono)", fontSize:"10px", color:"var(--ink-4)", textTransform:"uppercase", letterSpacing:"0.18em", marginBottom:"3px" }}>Project Roster</p>
          <h2 style={{ fontFamily:"var(--font-lora)", fontSize:"1.1rem", fontWeight:600, color:"var(--ink)" }}>Authorized Collaborators</h2>
          {transferred && <p style={{ fontFamily:"var(--font-geist-mono)", fontSize:"10px", color:"var(--ink-4)", marginTop:"4px" }}>Ownership transferred — admin panel hidden.</p>}
        </div>
        <RosterList roster={roster} loading={rosterLoading} currentAddress={address} error={rosterError} />
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ── Full admin view ───────────────────────────────────────────────────────
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
            <h2 style={{ fontFamily:"var(--font-lora)", fontSize:"1.1rem", fontWeight:600, color:"var(--ink)", marginBottom:"3px" }}>Manage Collaborators</h2>
            <p style={{ fontFamily:"var(--font-geist-mono)", fontSize:"10px", color:"var(--ink-4)" }}>
              Project: <span style={{ color:"var(--ink-2)", fontWeight:600 }}>{projectId}</span>
              &nbsp;·&nbsp; Admin: <span style={{ color:"var(--ink-2)" }}>{truncate(adminAddress)}</span>
            </p>
          </div>
          {isHalted && (
            <div style={{ border:"1px solid #FECACA", borderRadius:"8px", background:"#FEF2F2", padding:"16px", marginBottom:"18px" }}>
              <p style={{ fontFamily:"var(--font-geist-mono)", fontSize:"0.95rem", color:"#991B1B", margin:0, fontWeight:700 }}>Arbitration Active: Collaborator changes are frozen.</p>
              <p style={{ fontFamily:"var(--font-geist-mono)", fontSize:"0.9rem", color:"#991B1B", margin:"10px 0 0" }}>Only the project admin can resolve the dispute to restore write access.</p>
              {disputeReason && (
                <p style={{ fontFamily:"var(--font-geist-mono)", fontSize:"0.9rem", color:"#7F1D1D", margin:"10px 0 0", fontWeight:700, lineHeight:1.5 }}>
                  Reason: {disputeReason}
                </p>
              )}
              <button onClick={handleResolveDispute} disabled={resolving}
                style={{ marginTop:"12px", padding:"10px 16px", borderRadius:"6px", border:"1px solid #991B1B", background: resolving ? "#FEE2E2" : "#991B1B", color: resolving ? "#991B1B" : "#fff", fontWeight:700, cursor: resolving ? "not-allowed" : "pointer" }}>
                {resolving ? "Resolving dispute…" : "Resolve Dispute"}
              </button>
            </div>
          )}

          {/* Authorize form */}
          <form onSubmit={handleAuthorize} style={{ display:"flex", flexDirection:"column", gap:"10px", marginBottom:"20px" }}>
            <label style={{ fontFamily:"var(--font-geist-mono)", fontSize:"10px", color:"var(--ink-4)", textTransform:"uppercase", letterSpacing:"0.15em" }}>
              Authorize New Wallet Address
            </label>
            <div style={{ display:"flex", gap:"8px" }}>
              <input
                type="text" value={collabAddr}
                onChange={e => { setCollabAddr(e.target.value); setCollabError(""); }}
                disabled={authorizing || isHalted}
                placeholder="0x0000000000000000000000000000000000000000"
                spellCheck={false}
                style={{ flex:1, padding:"9px 12px", borderRadius:"6px", border:`1px solid ${collabError ? "var(--danger)" : collabAddr && isValidAddress(collabAddr) ? "#A8D8BE" : "var(--rule)"}`, background:"var(--paper)", color:"var(--ink)", fontFamily:"var(--font-geist-mono)", fontSize:"12px", outline:"none" }}
              />
              <button type="submit" disabled={authorizing || !!collabError || !collabAddr || isHalted}
                style={{ padding:"9px 16px", borderRadius:"6px", border:"none", background: authorizing || !collabAddr || collabError || isHalted ? "var(--paper-3)" : "var(--warning)", color: authorizing || !collabAddr || collabError || isHalted ? "var(--ink-4)" : "#fff", fontSize:"12px", fontWeight:600, cursor: authorizing || !collabAddr || collabError || isHalted ? "not-allowed" : "pointer", whiteSpace:"nowrap", display:"flex", alignItems:"center", gap:"6px" }}>
                {authorizing ? (
                  <svg style={{ animation:"spin 1s linear infinite", width:"12px", height:"12px" }} fill="none" viewBox="0 0 24 24"><circle style={{ opacity:0.2 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/><path style={{ opacity:0.8 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                ) : null}
                {authorizing ? "Adding…" : "Authorize"}
              </button>
            </div>
            {collabError && <p style={{ fontSize:"11px", color:"var(--danger)", fontFamily:"var(--font-geist-mono)" }}>✕ {collabError}</p>}
          </form>

          {/* ── Roster ─────────────────────────────────────────────────── */}
          <div style={{ marginBottom:"16px" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"10px" }}>
              <p style={{ fontFamily:"var(--font-geist-mono)", fontSize:"10px", color:"var(--ink-4)", textTransform:"uppercase", letterSpacing:"0.15em" }}>
                Current Authorized Roster
              </p>
              <button onClick={() => fetchRoster(adminAddress)} disabled={rosterLoading}
                style={{ display:"flex", alignItems:"center", gap:"4px", background:"none", border:"none", cursor: rosterLoading ? "not-allowed" : "pointer", color:"var(--ink-4)", fontFamily:"var(--font-geist-mono)", fontSize:"10px", opacity: rosterLoading ? 0.5 : 1 }}>
                <svg style={{ animation: rosterLoading ? "spin 1s linear infinite" : "none", width:"11px", height:"11px" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582M20 20v-5h-.581M5.635 19A9 9 0 104.582 9"/>
                </svg>
                Refresh
              </button>
            </div>
            <RosterList roster={roster} loading={rosterLoading} currentAddress={address} error={rosterError} />
          </div>

          {/* ── Danger Zone ────────────────────────────────────────────── */}
          <div style={{ borderTop:"1px solid var(--rule-light)", paddingTop:"14px" }}>
            <button onClick={() => setShowDanger(d => !d)}
              style={{ display:"flex", alignItems:"center", gap:"6px", background:"none", border:"none", cursor:"pointer", padding:0, marginBottom: showDanger ? "12px" : 0 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color:"var(--danger)", flexShrink:0 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
              </svg>
              <span style={{ fontFamily:"var(--font-geist-mono)", fontSize:"10px", color:"var(--danger)", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.15em" }}>
                Transfer Ownership {showDanger ? "▲" : "▼"}
              </span>
            </button>

            {showDanger && (
              <div style={{ background:"var(--danger-bg)", border:"1px solid #F5C6CB", borderRadius:"6px", padding:"14px 16px" }}>
                <p style={{ fontSize:"12px", color:"var(--danger)", lineHeight:1.6, marginBottom:"12px", fontFamily:"var(--font-geist-mono)" }}>
                  ⚠ Irreversible. You will lose admin rights immediately.
                </p>
                <form onSubmit={handleTransfer} style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
                  <input type="text" value={transferAddr} onChange={e => { setTransferAddr(e.target.value); setTransferError(""); }} disabled={transferring || isHalted}
                    placeholder="New admin wallet address (0x...)" spellCheck={false}
                    style={{ width:"100%", padding:"9px 12px", borderRadius:"6px", border:`1px solid ${transferError ? "var(--danger)" : "var(--rule)"}`, background:"var(--paper)", color:"var(--ink)", fontFamily:"var(--font-geist-mono)", fontSize:"12px", outline:"none", boxSizing:"border-box" }} />
                  {transferError && <p style={{ fontSize:"11px", color:"var(--danger)", fontFamily:"var(--font-geist-mono)" }}>✕ {transferError}</p>}
                  <button type="submit" disabled={transferring || !transferAddr || isHalted}
                    style={{ width:"100%", padding:"10px", borderRadius:"6px", border:"1px solid var(--danger)", background:"var(--paper)", color:"var(--danger)", fontSize:"12px", fontWeight:700, cursor: transferring || !transferAddr || isHalted ? "not-allowed" : "pointer", opacity: transferring || !transferAddr || isHalted ? 0.5 : 1, display:"flex", alignItems:"center", justifyContent:"center", gap:"8px" }}>
                    {transferring ? (
                      <svg style={{ animation:"spin 1s linear infinite", width:"12px", height:"12px" }} fill="none" viewBox="0 0 24 24"><circle style={{ opacity:0.2 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/><path style={{ opacity:0.8 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    ) : null}
                    {transferring ? "Transferring…" : "Transfer Ownership"}
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

// ── Roster List sub-component ─────────────────────────────────────────────────
function RosterList({ roster, loading, currentAddress, error }) {
  if (loading) return (
    <div style={{ display:"flex", flexDirection:"column", gap:"6px" }}>
      {[...Array(2)].map((_, i) => (
        <div key={i} style={{ height:"52px", borderRadius:"6px", background:"var(--paper-2)", border:"1px solid var(--rule-light)", animation:"pulse 1.5s infinite", animationDelay:`${i*150}ms` }} />
      ))}
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>
    </div>
  );

  if (error) return (
    <div style={{ background:"var(--danger-bg)", border:"1px solid #F5C6CB", borderRadius:"6px", padding:"12px", display:"flex", gap:"8px", alignItems:"flex-start" }}>
      <span style={{ color:"var(--danger)", fontWeight:700, flexShrink:0 }}>⚠</span>
      <div style={{ flex:1 }}>
        <p style={{ fontFamily:"var(--font-geist-mono)", fontSize:"11px", color:"var(--danger)", lineHeight:1.5, margin:"0 0 6px 0" }}>
          {error}
        </p>
        <p style={{ fontFamily:"var(--font-geist-mono)", fontSize:"10px", color:"var(--danger)", opacity:0.8, margin:0, lineHeight:1.4 }}>
          💡 <strong>Try:</strong> Verify the contract address is correct and has been deployed with the latest AcademicLedger v4 code.
        </p>
      </div>
    </div>
  );

  if (roster.length === 0) return (
    <p style={{ fontFamily:"var(--font-geist-mono)", fontSize:"11px", color:"var(--ink-4)", fontStyle:"italic", padding:"10px 0" }}>
      No collaborators authorized yet.
    </p>
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"6px" }}>
      {roster.map((entry, i) => {
        const isMe = currentAddress && entry.address.toLowerCase() === currentAddress.toLowerCase();
        return (
          <div key={i} style={{
            display:"flex", alignItems:"center", gap:"10px",
            background: entry.isAdmin ? "var(--warning-bg)" : isMe ? "var(--accent-bg)" : "var(--paper-2)",
            border: `1px solid ${entry.isAdmin ? "#E8D088" : isMe ? "#A8D8BE" : "var(--rule-light)"}`,
            borderRadius:"6px", padding:"9px 12px",
          }}>
            {/* Avatar */}
            <div style={{ width:"28px", height:"28px", borderRadius:"50%", background: entry.isAdmin ? "var(--warning-bg)" : "var(--paper-3)", border:`1px solid ${entry.isAdmin ? "#E8D088" : "var(--rule)"}`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              {entry.isAdmin ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color:"var(--warning)" }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/>
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color:"var(--ink-4)" }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                </svg>
              )}
            </div>

            {/* Identity */}
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:"flex", alignItems:"center", gap:"6px", marginBottom:"1px" }}>
                <p style={{ fontFamily:"var(--font-geist-sans)", fontSize:"12px", fontWeight:700, color:"var(--ink)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {entry.name ?? "Unregistered Wallet"}
                </p>
                {entry.isAdmin && (
                  <span style={{ fontFamily:"var(--font-geist-mono)", fontSize:"8px", fontWeight:700, background:"var(--warning)", color:"#fff", padding:"1px 5px", borderRadius:"3px", letterSpacing:"0.1em", flexShrink:0 }}>ADMIN</span>
                )}
                {isMe && !entry.isAdmin && (
                  <span style={{ fontFamily:"var(--font-geist-mono)", fontSize:"8px", fontWeight:700, background:"var(--accent)", color:"#fff", padding:"1px 5px", borderRadius:"3px", letterSpacing:"0.1em", flexShrink:0 }}>YOU</span>
                )}
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:"8px", flexWrap:"wrap" }}>
                {entry.orcid && (
                  <span style={{ fontFamily:"var(--font-geist-mono)", fontSize:"9px", color:"var(--accent)", background:"var(--accent-bg)", border:"1px solid #A8D8BE", padding:"1px 5px", borderRadius:"3px" }}>
                    ORCID {entry.orcid}
                  </span>
                )}
                <span style={{ fontFamily:"var(--font-geist-mono)", fontSize:"10px", color:"var(--ink-4)" }}>
                  {truncate(entry.address)}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
