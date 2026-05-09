"use client";
/**
 * components/ProjectSelector.jsx
 *
 * Replaces the manual text input with a dropdown populated from
 * getUserProjects(msg.sender). Includes a "Create New Project" button
 * that calls initializeProject() on-chain.
 */
import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import toast from "react-hot-toast";
import { useWallet } from "@/context/WalletContext";

const VALID_RE = /^[a-zA-Z0-9_\-\.]{3,64}$/;

export default function ProjectSelector({ contractAddress, contractABI, onProjectChange, currentProjectId }) {
  const { address } = useWallet();

  const [projects,     setProjects]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [showModal,    setShowModal]    = useState(false);
  const [newId,        setNewId]        = useState("");
  const [newIdTouched, setNewIdTouched] = useState(false);
  const [creating,     setCreating]     = useState(false);

  const newIdValid = VALID_RE.test(newId.trim());

  // ── Fetch user's projects from chain ──────────────────────────────────────
  const fetchProjects = useCallback(async () => {
    if (!contractAddress || !contractABI || !address) return;
    setLoading(true);
    try {
      const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_RPC_URL);
      const contract = new ethers.Contract(contractAddress, contractABI, provider);
      const list     = await contract.getUserProjects(address);
      const arr      = [...list];
      setProjects(arr);
      // Auto-select if only one project and nothing selected yet
      if (arr.length === 1 && !currentProjectId) {
        onProjectChange(arr[0]);
      }
    } catch (err) {
      console.error("Failed to fetch projects:", err);
    } finally {
      setLoading(false);
    }
  }, [contractAddress, contractABI, address, currentProjectId, onProjectChange]);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  // ── Create new project on-chain ───────────────────────────────────────────
  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newIdValid) return;

    const toastId = toast.loading("Confirm in MetaMask\u2026");
    setCreating(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer   = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, contractABI, signer);

      // Check the ID isn't already taken before sending tx
      const exists = await contract.doesProjectExist(newId.trim());
      if (exists) {
        toast.error("Project ID already taken. Choose a different one.", { id: toastId });
        setCreating(false);
        return;
      }

      const tx = await contract.initializeProject(newId.trim());
      toast.loading("Initialising project on-chain\u2026", { id: toastId });
      await tx.wait(1);
      toast.success(`Project "${newId.trim()}" created.`, { id: toastId });

      // Refresh list and auto-select the new project
      const readProvider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_RPC_URL);
      const readContract = new ethers.Contract(contractAddress, contractABI, readProvider);
      const list         = await readContract.getUserProjects(address);
      setProjects([...list]);
      onProjectChange(newId.trim());

      setNewId("");
      setNewIdTouched(false);
      setShowModal(false);
    } catch (err) {
      const msg = err?.code === 4001
        ? "Transaction rejected."
        : err?.message ?? "Failed to create project.";
      toast.error(msg, { id: toastId });
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      {/* ── Selector row ──────────────────────────────────────────────────── */}
      <div style={{ background:"var(--paper)", border:"1px solid var(--rule)", borderRadius:"8px", padding:"18px 22px" }}>
        <p style={{ fontFamily:"var(--font-geist-mono)", fontSize:"10px", color:"var(--ink-4)", textTransform:"uppercase", letterSpacing:"0.18em", marginBottom:"8px" }}>
          Project Workspace
        </p>

        <div style={{ display:"flex", gap:"10px", alignItems:"flex-start" }}>
          {/* Dropdown */}
          <div style={{ flex:1, position:"relative" }}>
            <select
              value={currentProjectId ?? ""}
              onChange={e => onProjectChange(e.target.value)}
              disabled={loading}
              style={{
                width:"100%", padding:"9px 32px 9px 14px", borderRadius:"6px",
                border:"1px solid var(--rule)",
                background:"var(--paper)",
                color: projects.length === 0 ? "var(--ink-4)" : "var(--ink)",
                fontFamily:"var(--font-geist-mono)", fontSize:"13px",
                appearance:"none",
                backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239A9A90' stroke-width='2'%3E%3Cpath d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
                backgroundRepeat:"no-repeat", backgroundPosition:"right 12px center",
                cursor: loading ? "wait" : "pointer",
              }}
            >
              {loading ? (
                <option value="">Loading your projects…</option>
              ) : projects.length === 0 ? (
                <option value="">No projects yet — create one →</option>
              ) : (
                <>
                  <option value="">Select a project…</option>
                  {projects.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </>
              )}
            </select>
          </div>

          {/* New Project button */}
          <button
            onClick={() => setShowModal(true)}
            style={{
              padding:"9px 16px", borderRadius:"6px",
              border:"1px solid var(--accent)", background:"var(--accent-bg)",
              color:"var(--accent)", fontFamily:"var(--font-geist-mono)",
              fontSize:"12px", fontWeight:600, cursor:"pointer", whiteSpace:"nowrap", flexShrink:0,
            }}
          >
            + New Project
          </button>

          {/* Refresh */}
          <button
            onClick={fetchProjects}
            disabled={loading}
            title="Refresh project list"
            style={{
              padding:"9px 10px", borderRadius:"6px",
              border:"1px solid var(--rule)", background:"var(--paper)",
              color:"var(--ink-4)", cursor: loading ? "not-allowed" : "pointer", flexShrink:0,
            }}
          >
            <svg
              style={{ display:"block", animation: loading ? "spin 1s linear infinite" : "none" }}
              width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582M20 20v-5h-.581M5.635 19A9 9 0 104.582 9"/>
            </svg>
          </button>
        </div>

        {currentProjectId && (
          <p style={{ fontFamily:"var(--font-geist-mono)", fontSize:"11px", color:"var(--ink-4)", marginTop:"8px" }}>
            Active: <span style={{ color:"var(--ink-2)", fontWeight:600 }}>{currentProjectId}</span>
          </p>
        )}
      </div>

      {/* ── Create Project Modal ───────────────────────────────────────────── */}
      {showModal && (
        <div style={{
          position:"fixed", inset:0, zIndex:200,
          background:"rgba(26,26,24,0.55)", backdropFilter:"blur(4px)",
          display:"flex", alignItems:"center", justifyContent:"center", padding:"20px",
        }}>
          <div style={{
            background:"var(--paper)", border:"1px solid var(--rule)",
            borderRadius:"12px", width:"100%", maxWidth:"440px",
            overflow:"hidden", boxShadow:"0 8px 40px rgba(0,0,0,0.18)",
          }}>
            <div style={{ height:"3px", background:"var(--indigo)" }} />
            <div style={{ padding:"28px 30px" }}>

              <div style={{ marginBottom:"18px" }}>
                <p style={{ fontFamily:"var(--font-geist-mono)", fontSize:"10px", color:"var(--indigo)", textTransform:"uppercase", letterSpacing:"0.2em", marginBottom:"5px" }}>
                  Project Registry
                </p>
                <h2 style={{ fontFamily:"var(--font-lora)", fontSize:"1.3rem", fontWeight:600, color:"var(--ink)", marginBottom:"8px" }}>
                  Create New Project
                </h2>
                <p style={{ fontSize:"13px", color:"var(--ink-3)", lineHeight:1.6 }}>
                  The Project ID becomes an immutable namespace on the smart contract.
                  Choose carefully — it cannot be changed after creation.
                </p>
              </div>

              <form onSubmit={handleCreate} style={{ display:"flex", flexDirection:"column", gap:"14px" }}>
                <div>
                  <label style={{ fontFamily:"var(--font-geist-mono)", fontSize:"10px", color:"var(--ink-4)", textTransform:"uppercase", letterSpacing:"0.15em", display:"block", marginBottom:"6px" }}>
                    Project ID
                  </label>
                  <input
                    type="text"
                    value={newId}
                    onChange={e => { setNewId(e.target.value); setNewIdTouched(true); }}
                    placeholder="e.g. DLT-Research-2026"
                    disabled={creating}
                    spellCheck={false}
                    autoFocus
                    style={{
                      width:"100%", padding:"10px 14px", borderRadius:"6px",
                      border:`1px solid ${newIdTouched && !newIdValid && newId ? "var(--danger)" : newIdValid ? "#A8D8BE" : "var(--rule)"}`,
                      background:"var(--paper)", color:"var(--ink)",
                      fontFamily:"var(--font-geist-mono)", fontSize:"14px",
                      outline:"none", boxSizing:"border-box",
                    }}
                  />
                  {newIdTouched && !newIdValid && newId ? (
                    <p style={{ fontSize:"11px", color:"var(--danger)", marginTop:"4px", fontFamily:"var(--font-geist-mono)" }}>
                      3–64 chars. Letters, numbers, hyphens and dots only.
                    </p>
                  ) : newIdValid ? (
                    <p style={{ fontSize:"11px", color:"var(--accent)", marginTop:"4px", fontFamily:"var(--font-geist-mono)" }}>
                      ✓ Valid project ID
                    </p>
                  ) : null}
                </div>

                <div style={{ display:"flex", gap:"10px" }}>
                  <button
                    type="button"
                    onClick={() => { setShowModal(false); setNewId(""); setNewIdTouched(false); }}
                    disabled={creating}
                    style={{
                      flex:1, padding:"11px", borderRadius:"6px",
                      border:"1px solid var(--rule)", background:"var(--paper)",
                      color:"var(--ink-3)", fontSize:"13px", cursor:"pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!newIdValid || creating}
                    style={{
                      flex:1, padding:"11px", borderRadius:"6px", border:"none",
                      background: !newIdValid || creating ? "var(--paper-3)" : "var(--indigo)",
                      color: !newIdValid || creating ? "var(--ink-4)" : "#fff",
                      fontSize:"13px", fontWeight:600,
                      cursor: !newIdValid || creating ? "not-allowed" : "pointer",
                      display:"flex", alignItems:"center", justifyContent:"center", gap:"8px",
                    }}
                  >
                    {creating ? (
                      <>
                        <svg style={{ animation:"spin 1s linear infinite", width:"13px", height:"13px" }} fill="none" viewBox="0 0 24 24">
                          <circle style={{ opacity:0.2 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                          <path style={{ opacity:0.8 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                        </svg>
                        Creating…
                      </>
                    ) : "Create Project"}
                  </button>
                </div>
              </form>

            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </>
  );
}