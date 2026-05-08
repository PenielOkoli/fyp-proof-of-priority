"use client";
/**
 * components/ContributionTimeline.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * A real-time, vertically-scrolling timeline of all ContributionLogged events
 * for a given project. Uses ethers.js v6 to:
 *   1. Query historical events on mount (chunked to respect Alchemy free tier)
 *   2. Subscribe to live events via contract.on() for instant updates
 *   3. Clean up the listener on component unmount
 *
 * Props
 * ─────
 *   contractAddress  {string}
 *   contractABI      {Array}
 *   projectId        {string}
 *   readOnlyRpcUrl   {string}  – Alchemy/Infura HTTPS endpoint
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { ethers } from "ethers";
import toast from "react-hot-toast";

const GATEWAY = process.env.NEXT_PUBLIC_PINATA_GATEWAY ?? "https://gateway.pinata.cloud/ipfs";

// ── CRediT role → accent color mapping ───────────────────────────────────────
const ROLE_STYLE = {
  "Conceptualization":          { dot: "#a78bfa", badge: "bg-violet-950/60 text-violet-300 border-violet-700/40" },
  "Data Curation":              { dot: "#38bdf8", badge: "bg-sky-950/60 text-sky-300 border-sky-700/40" },
  "Formal Analysis":            { dot: "#60a5fa", badge: "bg-blue-950/60 text-blue-300 border-blue-700/40" },
  "Funding Acquisition":        { dot: "#fbbf24", badge: "bg-amber-950/60 text-amber-300 border-amber-700/40" },
  "Investigation":              { dot: "#2dd4bf", badge: "bg-teal-950/60 text-teal-300 border-teal-700/40" },
  "Methodology":                { dot: "#22d3ee", badge: "bg-cyan-950/60 text-cyan-300 border-cyan-700/40" },
  "Project Administration":     { dot: "#f472b6", badge: "bg-pink-950/60 text-pink-300 border-pink-700/40" },
  "Resources":                  { dot: "#fb923c", badge: "bg-orange-950/60 text-orange-300 border-orange-700/40" },
  "Software":                   { dot: "#4ade80", badge: "bg-emerald-950/60 text-emerald-300 border-emerald-700/40" },
  "Supervision":                { dot: "#c084fc", badge: "bg-purple-950/60 text-purple-300 border-purple-700/40" },
  "Validation":                 { dot: "#a3e635", badge: "bg-lime-950/60 text-lime-300 border-lime-700/40" },
  "Visualization":              { dot: "#e879f9", badge: "bg-fuchsia-950/60 text-fuchsia-300 border-fuchsia-700/40" },
  "Writing – Original Draft":   { dot: "#f87171", badge: "bg-rose-950/60 text-rose-300 border-rose-700/40" },
  "Writing – Review & Editing": { dot: "#818cf8", badge: "bg-indigo-950/60 text-indigo-300 border-indigo-700/40" },
};

const DEFAULT_STYLE = { dot: "#00ffa3", badge: "bg-[#0a2a1a] text-[#00ffa3] border-[#00ffa3]/30" };

// ── Helpers ───────────────────────────────────────────────────────────────────
function truncate(addr) {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatDate(unixSeconds) {
  const d = new Date(Number(unixSeconds) * 1000);
  return {
    date: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
    time: d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
  };
}

// ── Timeline Entry Component ──────────────────────────────────────────────────
function TimelineEntry({ entry, index, isNew }) {
  const style = ROLE_STYLE[entry.role] ?? DEFAULT_STYLE;
  const { date, time } = formatDate(entry.timestamp);

  return (
    <div
      className={`
        relative flex gap-4 pb-8 last:pb-0
        transition-all duration-700
        ${isNew ? "animate-[fadeSlideIn_0.5s_ease_forwards]" : ""}
      `}
    >
      {/* ── Timeline spine ─────────────────────────────────────────────────── */}
      <div className="flex flex-col items-center shrink-0 w-10">
        {/* Dot */}
        <div
          className="relative z-10 w-3.5 h-3.5 rounded-full mt-1 ring-2 ring-[#0d0d0d] shrink-0"
          style={{ backgroundColor: style.dot, boxShadow: `0 0 8px ${style.dot}60` }}
        >
          {isNew && (
            <span
              className="absolute inset-0 rounded-full animate-ping"
              style={{ backgroundColor: style.dot, opacity: 0.4 }}
            />
          )}
        </div>
        {/* Vertical line */}
        <div className="w-px flex-1 mt-1 bg-gradient-to-b from-[#2a2a2a] to-transparent" />
      </div>

      {/* ── Card ─────────────────────────────────────────────────────────────── */}
      <div className={`
        flex-1 bg-[#0a0a0a] border rounded-xl px-4 py-3.5 mb-1
        transition-all duration-300 hover:border-[#333] group
        ${isNew ? "border-[#1e3a2a]" : "border-[#1a1a1a]"}
      `}>
        {/* Top row: index + timestamp */}
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2">
            {/* Commit-style hash chip */}
            <span className="text-[9px] font-mono tracking-widest bg-[#111] border border-[#222] text-[#444] px-2 py-0.5 rounded">
              #{String(index + 1).padStart(3, "0")}
            </span>
            {isNew && (
              <span className="text-[9px] font-bold tracking-widest uppercase text-[#00ffa3] bg-[#00ffa3]/10 border border-[#00ffa3]/20 px-2 py-0.5 rounded-full">
                New
              </span>
            )}
          </div>
          <div className="text-right">
            <p className="text-[11px] font-mono text-[#555]">{date}</p>
            <p className="text-[10px] font-mono text-[#333]">{time}</p>
          </div>
        </div>

        {/* Wallet address */}
        <div className="flex items-center gap-2 mb-2.5">
          <div className="w-5 h-5 rounded-full shrink-0 ring-1 ring-[#222]"
            style={{ background: `linear-gradient(135deg, ${style.dot}40, ${style.dot}10)` }}
          />
          <button
            onClick={() => {
              navigator.clipboard?.writeText(entry.contributor);
              toast.success("Address copied", { duration: 1500 });
            }}
            className="font-mono text-xs text-[#00ffa3] hover:text-white transition-colors tracking-wide"
            title={entry.contributor}
          >
            {truncate(entry.contributor)}
          </button>
          <span className="text-[#333] text-[10px]">·</span>
          <span className="text-[#444] text-[10px]">click to copy</span>
        </div>

        {/* Role badge */}
        <div className="flex items-center justify-between gap-3">
          <span className={`
            inline-flex items-center text-[10px] font-semibold tracking-wide
            px-2.5 py-1 rounded-full border
            ${style.badge}
          `}>
            {entry.role}
          </span>

          {/* IPFS link */}
          <a
            href={`${GATEWAY}/${entry.cid}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[#555] hover:text-[#00c8ff] transition-colors group/link"
            title={`IPFS: ${entry.cid}`}
          >
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <span className="text-[10px] font-mono group-hover/link:text-[#00c8ff] transition-colors">
              {entry.cid.slice(0, 12)}…
            </span>
          </a>
        </div>

        {/* Tx hash row */}
        {entry.txHash && (
          <div className="mt-2.5 pt-2.5 border-t border-[#111] flex items-center gap-1.5">
            <svg className="w-3 h-3 text-[#333] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(entry.txHash);
                toast.success("Tx hash copied", { duration: 1500 });
              }}
              className="text-[10px] font-mono text-[#333] hover:text-[#a78bfa] transition-colors"
              title={entry.txHash}
            >
              {truncate(entry.txHash)}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ContributionTimeline({
  contractAddress,
  contractABI,
  projectId,
  readOnlyRpcUrl,
}) {
  const [entries, setEntries] = useState([]);
  const [newIds, setNewIds] = useState(new Set());    // tracks which entries are "new" for animation
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [isLive, setIsLive] = useState(false);

  // Keep a stable ref to the contract for the event listener cleanup
  const contractRef = useRef(null);
  const providerRef = useRef(null);

  // ── Build provider + contract ─────────────────────────────────────────────
  const getProvider = useCallback(() => {
    if (readOnlyRpcUrl) return new ethers.JsonRpcProvider(readOnlyRpcUrl);
    if (typeof window !== "undefined" && window.ethereum)
      return new ethers.BrowserProvider(window.ethereum);
    throw new Error("No provider available. Pass readOnlyRpcUrl or install MetaMask.");
  }, [readOnlyRpcUrl]);

  // ── Historical event fetch (chunked for Alchemy free tier) ────────────────
  const fetchHistory = useCallback(async (contract, provider) => {
    const currentBlock = await provider.getBlockNumber();
    const CHUNK = 9;
    const MAX_CHUNKS = 600; // ~5400 blocks back (~18 hrs on Sepolia)

    let allLogs = [];
    const filter = contract.filters.ContributionLogged(projectId);

    for (let i = 0; i < MAX_CHUNKS; i++) {
      const toBlock = currentBlock - i * CHUNK;
      const fromBlock = Math.max(0, toBlock - CHUNK + 1);
      if (toBlock < 0) break;
      try {
        const logs = await contract.queryFilter(filter, fromBlock, toBlock);
        allLogs = allLogs.concat(logs);
      } catch {
        // skip failed chunks silently
      }
      if (fromBlock === 0) break;
    }

    return allLogs.map((log) => ({
      contributor: log.args.contributor,
      cid:         log.args.cid,
      role:        log.args.creditRole,
      timestamp:   log.args.timestamp,
      txHash:      log.transactionHash,
      blockNumber: log.blockNumber,
    })).sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
  }, [projectId]);

  // ── Setup: fetch history + attach live listener ───────────────────────────
  useEffect(() => {
    if (!contractAddress || !contractABI || !projectId) return;

    let isMounted = true;

    const init = async () => {
      setLoading(true);
      setError("");

      try {
        const provider = getProvider();
        providerRef.current = provider;

        const contract = new ethers.Contract(contractAddress, contractABI, provider);
        contractRef.current = contract;

        // 1 — Load historical events
        const history = await fetchHistory(contract, provider);
        if (isMounted) {
          setEntries(history);
          setLastRefreshed(new Date());
          setLoading(false);
        }

        // 2 — Subscribe to live events
        // This fires immediately when a new ContributionLogged event is mined
        const handleLiveEvent = (projectIdArg, contributor, cid, creditRole, timestamp, event) => {
          // Filter to this project only
          if (projectIdArg !== projectId) return;

          const newEntry = {
            contributor,
            cid,
            role: creditRole,
            timestamp,
            txHash: event?.log?.transactionHash ?? "",
            blockNumber: event?.log?.blockNumber ?? 0,
          };

          const entryKey = `${newEntry.txHash}-${newEntry.timestamp}`;

          if (isMounted) {
            setEntries((prev) => {
              // Deduplicate by txHash
              const exists = prev.some((e) => e.txHash === newEntry.txHash);
              if (exists) return prev;
              return [newEntry, ...prev];
            });

            // Mark as new for the "ping" animation — clear after 8s
            setNewIds((prev) => {
              const next = new Set(prev);
              next.add(entryKey);
              return next;
            });
            setTimeout(() => {
              setNewIds((prev) => {
                const next = new Set(prev);
                next.delete(entryKey);
                return next;
              });
            }, 8000);

            toast.success("New contribution logged on-chain!", {
              icon: "⛓️",
              style: {
                background: "#0d0d0d",
                border: "1px solid #1a1a1a",
                color: "#00ffa3",
                fontFamily: "monospace",
              },
            });
          }
        };

        contract.on("ContributionLogged", handleLiveEvent);
        if (isMounted) setIsLive(true);

      } catch (err) {
        if (isMounted) {
          setError(err?.message ?? "Failed to load contributions.");
          setLoading(false);
        }
      }
    };

    init();

    // ── Cleanup: remove listener on unmount ───────────────────────────────
    return () => {
      isMounted = false;
      if (contractRef.current) {
        contractRef.current.removeAllListeners("ContributionLogged");
      }
      setIsLive(false);
    };
  }, [contractAddress, contractABI, projectId, getProvider, fetchHistory]);

  // ── Manual refresh ────────────────────────────────────────────────────────
  const handleRefresh = async () => {
    if (!contractRef.current || !providerRef.current) return;
    setLoading(true);
    try {
      const history = await fetchHistory(contractRef.current, providerRef.current);
      setEntries(history);
      setLastRefreshed(new Date());
    } catch (err) {
      setError(err?.message ?? "Refresh failed.");
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Keyframe for new entry slide-in animation */}
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(-12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="font-mono">
        <div className="relative bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl overflow-hidden shadow-2xl shadow-black/60">
          {/* Accent bar */}
          <div className="h-[3px] w-full bg-gradient-to-r from-[#a78bfa] via-[#00c8ff] to-[#00ffa3]" />

          <div className="px-6 py-5">
            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="flex items-start justify-between gap-3 mb-5">
              <div>
                <p className="text-[9px] tracking-[0.3em] uppercase text-[#a78bfa] mb-1">
                  DLT · Immutable Audit Trail
                </p>
                <h2 className="text-lg font-bold text-white tracking-tight">
                  Contribution Timeline
                </h2>
                <p className="text-[11px] text-[#555] mt-0.5">
                  Project: <span className="text-[#777]">{projectId}</span>
                </p>
              </div>

              <div className="flex flex-col items-end gap-2 shrink-0">
                {/* Live indicator */}
                <div className={`flex items-center gap-1.5 text-[10px] tracking-widest uppercase
                  ${isLive ? "text-[#00ffa3]" : "text-[#444]"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isLive ? "bg-[#00ffa3] animate-pulse" : "bg-[#333]"}`}/>
                  {isLive ? "Live" : "Offline"}
                </div>

                {/* Refresh button */}
                <button
                  onClick={handleRefresh}
                  disabled={loading}
                  className="flex items-center gap-1.5 text-[10px] tracking-widest uppercase text-[#444] hover:text-[#00ffa3] disabled:opacity-30 transition-colors"
                >
                  <svg className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 4v5h.582M20 20v-5h-.581M5.635 19A9 9 0 104.582 9"/>
                  </svg>
                  Refresh
                </button>

                {lastRefreshed && (
                  <p className="text-[9px] text-[#2a2a2a]">
                    {lastRefreshed.toLocaleTimeString()}
                  </p>
                )}
              </div>
            </div>

            {/* ── Stats row ───────────────────────────────────────────────── */}
            {entries.length > 0 && (
              <div className="flex items-center gap-3 mb-5">
                <span className="text-[10px] tracking-widest uppercase font-semibold text-[#00ffa3] bg-[#00ffa3]/8 border border-[#00ffa3]/15 px-3 py-1 rounded-full">
                  {entries.length} {entries.length === 1 ? "commit" : "commits"}
                </span>
                <div className="h-px flex-1 bg-gradient-to-r from-[#1a1a1a] to-transparent"/>
              </div>
            )}

            {/* ── Error ───────────────────────────────────────────────────── */}
            {error && (
              <div className="flex items-start gap-2.5 bg-red-950/20 border border-red-900/30 rounded-xl px-4 py-3 mb-4">
                <span className="text-red-400 shrink-0 text-sm">✕</span>
                <p className="text-red-400 text-xs leading-relaxed">{error}</p>
              </div>
            )}

            {/* ── Loading skeleton ─────────────────────────────────────────── */}
            {loading && entries.length === 0 && (
              <div className="space-y-4 pt-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="flex flex-col items-center w-10">
                      <div className="w-3.5 h-3.5 rounded-full bg-[#1a1a1a] animate-pulse mt-1"/>
                      <div className="w-px flex-1 mt-1 bg-[#111]"/>
                    </div>
                    <div className="flex-1 bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl px-4 py-3 mb-1 animate-pulse"
                      style={{ animationDelay: `${i * 150}ms` }}>
                      <div className="h-3 bg-[#111] rounded w-3/4 mb-2"/>
                      <div className="h-2.5 bg-[#111] rounded w-1/2 mb-2"/>
                      <div className="h-5 bg-[#111] rounded-full w-1/3"/>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Empty state ──────────────────────────────────────────────── */}
            {!loading && !error && entries.length === 0 && (
              <div className="text-center py-14">
                <div className="w-10 h-10 rounded-full bg-[#0f0f0f] border border-[#1a1a1a] flex items-center justify-center mx-auto mb-3">
                  <svg className="w-4.5 h-4.5 text-[#2a2a2a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                  </svg>
                </div>
                <p className="text-[#333] text-sm">No contributions logged yet.</p>
                <p className="text-[#222] text-xs mt-1">The timeline will populate after the first on-chain log.</p>
              </div>
            )}

            {/* ── Timeline ─────────────────────────────────────────────────── */}
            {entries.length > 0 && (
              <div className="pt-2">
                {entries.map((entry, idx) => {
                  const key = `${entry.txHash}-${entry.timestamp}`;
                  return (
                    <TimelineEntry
                      key={key}
                      entry={entry}
                      index={idx}
                      isNew={newIds.has(key)}
                    />
                  );
                })}
              </div>
            )}

            {/* Footer */}
            {entries.length > 0 && (
              <p className="text-center text-[9px] text-[#1e1e1e] mt-2 tracking-widest uppercase">
                All records are append-only and immutable · No scoring applied
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
