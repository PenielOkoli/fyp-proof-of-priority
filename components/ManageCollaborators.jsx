"use client";
import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import toast from "react-hot-toast";

function isValidAddress(addr) { return /^0x[0-9a-fA-F]{40}$/.test(addr); }

export default function ManageCollaborators({ contractAddress, contractABI, projectId }) {
  const [isOwner, setIsOwner] = useState(false);
  const [checkingOwner, setCheckingOwner] = useState(true);
  const [connectedWallet, setConnectedWallet] = useState("");
  const [contractOwner, setContractOwner] = useState("");
  const [address, setAddress] = useState("");
  const [addrError, setAddrError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authorized, setAuthorized] = useState([]);

  const checkOwnership = useCallback(async () => {
    setCheckingOwner(true);
    try {
      if (!window.ethereum) throw new Error("MetaMask not found.");
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const walletAddr = await signer.getAddress();
      setConnectedWallet(walletAddr);
      const contract = new ethers.Contract(contractAddress, contractABI, provider);
      const owner = await contract.owner();
      setContractOwner(owner);
      setIsOwner(walletAddr.toLowerCase() === owner.toLowerCase());
    } catch { setIsOwner(false); }
    finally { setCheckingOwner(false); }
  }, [contractAddress, contractABI]);

  useEffect(() => {
    checkOwnership();
    if (window.ethereum) {
      window.ethereum.on("accountsChanged", checkOwnership);
      return () => window.ethereum.removeListener("accountsChanged", checkOwnership);
    }
  }, [checkOwnership]);

  const handleAddressChange = (e) => {
    const val = e.target.value; setAddress(val);
    setAddrError(val && !isValidAddress(val) ? "Must be a valid Ethereum address (0x + 40 hex chars)" : "");
  };

  const handleAuthorize = async (e) => {
    e.preventDefault();
    if (!address) { setAddrError("Address is required."); return; }
    if (!isValidAddress(address)) { setAddrError("Invalid Ethereum address."); return; }
    const toastId = toast.loading("Confirm in MetaMask…", { style: { background: "#0d0d0d", border: "1px solid #1a1a1a", color: "#e2e8f0", fontFamily: "monospace" } });
    setIsSubmitting(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, contractABI, signer);
      const tx = await contract.authorizeCollaborator(projectId, address);
      toast.loading("Transaction pending…", { id: toastId, style: { background: "#0d0d0d", border: "1px solid #1a1a1a", color: "#e2e8f0", fontFamily: "monospace" } });
      await tx.wait(1);
      toast.success("Collaborator authorized!", { id: toastId, icon: "✓", style: { background: "#0d0d0d", border: "1px solid #1a1a1a", color: "#00ffa3", fontFamily: "monospace" } });
      setAuthorized((prev) => [{ address, txHash: tx.hash }, ...prev]);
      setAddress(""); setAddrError("");
    } catch (err) {
      const msg = err?.code === 4001 ? "Transaction rejected in MetaMask." : err?.message ?? "Transaction failed.";
      toast.error(msg, { id: toastId, style: { background: "#0d0d0d", border: "1px solid #1a1a1a", color: "#f87171", fontFamily: "monospace" } });
    } finally { setIsSubmitting(false); }
  };

  if (checkingOwner) return (
    <div className="font-mono bg-[#0d0d0d] border border-[#1a1a1a] rounded-2xl px-6 py-5">
      <div className="flex items-center gap-2 text-[#333] text-xs">
        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
          <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
        Verifying ownership…
      </div>
    </div>
  );

  if (!isOwner) return (
    <div className="font-mono bg-[#0d0d0d] border border-[#1a1a1a] rounded-2xl px-6 py-5">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-[#0f0f0f] border border-[#1a1a1a] flex items-center justify-center shrink-0">
          <svg className="w-3.5 h-3.5 text-[#333]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
          </svg>
        </div>
        <div>
          <p className="text-[#444] text-xs font-semibold">Owner access required</p>
          <p className="text-[#2a2a2a] text-[10px] mt-0.5">Connected: <span className="text-[#333] font-mono">{connectedWallet ? connectedWallet.slice(0,6) + "…" + connectedWallet.slice(-4) : "—"}</span></p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="font-mono">
      <div className="relative bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl overflow-hidden shadow-2xl shadow-black/60">
        <div className="h-[3px] w-full bg-gradient-to-r from-[#fbbf24] via-[#f59e0b] to-[#d97706]"/>
        <div className="px-6 py-5">
          <div className="flex items-start justify-between mb-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-[9px] tracking-[0.3em] uppercase text-[#f59e0b]">Owner Panel</p>
                <span className="text-[9px] font-bold tracking-widest uppercase text-[#f59e0b] bg-[#f59e0b]/10 border border-[#f59e0b]/20 px-2 py-0.5 rounded-full">Admin</span>
              </div>
              <h2 className="text-lg font-bold text-white tracking-tight">Manage Collaborators</h2>
              <p className="text-[11px] text-[#555] mt-0.5">Project: <span className="text-[#777]">{projectId}</span></p>
            </div>
            <div className="text-right">
              <p className="text-[9px] text-[#444] tracking-widest uppercase mb-1">Owner</p>
              <p className="text-[10px] font-mono text-[#f59e0b]">{contractOwner ? contractOwner.slice(0,6) + "…" + contractOwner.slice(-4) : "—"}</p>
            </div>
          </div>
          <form onSubmit={handleAuthorize} className="space-y-4">
            <div>
              <label className="block text-[10px] tracking-[0.2em] uppercase text-[#555] mb-2">Wallet Address to Authorize</label>
              <input type="text" value={address} onChange={handleAddressChange} disabled={isSubmitting}
                placeholder="0x0000000000000000000000000000000000000000" spellCheck={false}
                className={"w-full bg-[#0a0a0a] border rounded-xl px-4 py-3 font-mono text-sm text-white placeholder-[#2a2a2a] focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed " + (addrError ? "border-red-900/50" : address && isValidAddress(address) ? "border-[#f59e0b]/30 focus:border-[#f59e0b]/60" : "border-[#1a1a1a] focus:border-[#333]")}/>
              {addrError && <p className="text-red-400 text-[10px] mt-1.5">✕ {addrError}</p>}
              {address && isValidAddress(address) && !addrError && <p className="text-[#f59e0b]/60 text-[10px] mt-1.5">✓ Valid Ethereum address</p>}
            </div>
            <button type="submit" disabled={isSubmitting || !!addrError || !address}
              className={"w-full py-3.5 rounded-xl text-[11px] font-bold tracking-[0.2em] uppercase transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed " + (isSubmitting ? "bg-[#111] border border-[#222] text-[#555]" : "bg-gradient-to-r from-[#f59e0b] to-[#d97706] text-[#050505] hover:brightness-110 active:scale-[0.99] shadow-lg shadow-[#f59e0b]/10")}>
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                    <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Processing…
                </span>
              ) : "Authorize Collaborator"}
            </button>
          </form>
          {authorized.length > 0 && (
            <div className="mt-5 pt-4 border-t border-[#111]">
              <p className="text-[9px] tracking-[0.2em] uppercase text-[#444] mb-3">Authorized this session</p>
              <div className="space-y-2">
                {authorized.map((item, i) => (
                  <div key={i} className="flex items-center justify-between bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]"/>
                      <span className="font-mono text-[11px] text-[#aaa]">{item.address.slice(0,6)}…{item.address.slice(-4)}</span>
                    </div>
                    <span className="text-[9px] text-[#333] font-mono">tx: {item.txHash.slice(0,8)}…</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
