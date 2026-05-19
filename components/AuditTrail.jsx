"use client";

import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { getFriendlyError } from "@/utils/errorFormatter";

const GATEWAY = process.env.NEXT_PUBLIC_PINATA_GATEWAY ?? "https://gateway.pinata.cloud/ipfs";

function truncateAddress(addr) {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatTimestamp(unixSeconds) {
  const date = new Date(Number(unixSeconds) * 1000 + 60 * 60 * 1000);
  return date.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    timeZone: "UTC",
    hour12: false,
  }) + " UTC+1";
}

const ROLE_COLORS = {
  "Conceptualization": "bg-violet-950/50 text-violet-300 border-violet-800/40",
  "Data Curation": "bg-sky-950/50 text-sky-300 border-sky-800/40",
  "Formal Analysis": "bg-blue-950/50 text-blue-300 border-blue-800/40",
  "Funding Acquisition": "bg-amber-950/50 text-amber-300 border-amber-800/40",
  "Investigation": "bg-teal-950/50 text-teal-300 border-teal-800/40",
  "Methodology": "bg-cyan-950/50 text-cyan-300 border-cyan-800/40",
  "Project Administration": "bg-pink-950/50 text-pink-300 border-pink-800/40",
  "Resources": "bg-orange-950/50 text-orange-300 border-orange-800/40",
  "Software": "bg-emerald-950/50 text-emerald-300 border-emerald-800/40",
  "Supervision": "bg-purple-950/50 text-purple-300 border-purple-800/40",
  "Validation": "bg-lime-950/50 text-lime-300 border-lime-800/40",
  "Visualization": "bg-fuchsia-950/50 text-fuchsia-300 border-fuchsia-800/40",
  "Writing – Original Draft": "bg-rose-950/50 text-rose-300 border-rose-800/40",
  "Writing – Review & Editing": "bg-indigo-950/50 text-indigo-300 border-indigo-800/40",
};

function RoleBadge({ role }) {
  const cls = ROLE_COLORS[role] ?? "bg-[#1a1a1a] text-[#888] border-[#2a2a2a]";
  return (
    <span className={`inline-block text-[10px] font-semibold tracking-wide px-2.5 py-1 rounded-full border ${cls} whitespace-nowrap`}>
      {role}
    </span>
  );
}

export default function AuditTrail({ contractAddress, contractABI, projectId, readOnlyRpcUrl }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastRefreshed, setLastRefreshed] = useState(null);

  const fetchContributions = useCallback(async () => {
    if (!contractAddress || !contractABI || !projectId) {
      setError("Missing contractAddress, contractABI, or projectId.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      let provider;
      if (readOnlyRpcUrl) {
        provider = new ethers.JsonRpcProvider(readOnlyRpcUrl);
      } else if (window.ethereum) {
        provider = new ethers.BrowserProvider(window.ethereum);
      } else {
        throw new Error("No provider available.");
      }

      const contract = new ethers.Contract(contractAddress, contractABI, provider);

      // ── Get current block and query only last 9 blocks (free tier limit is 10) ──
      // For a full history query we chunk backwards in 9-block windows
      const currentBlock = await provider.getBlockNumber();
      const CHUNK = 9;
      const LOOKBACK_CHUNKS = 500; // looks back ~4500 blocks (~15 hrs on Sepolia)

      let allLogs = [];
      const filter = contract.filters.ContributionLogged(projectId);

      for (let i = 0; i < LOOKBACK_CHUNKS; i++) {
        const toBlock = currentBlock - (i * CHUNK);
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

      const parsed = allLogs.map((log) => {
        const { contributor, cid, creditRole, timestamp } = log.args;
        return { contributor, cid, role: creditRole, timestamp, txHash: log.transactionHash };
      });

      parsed.sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
      setEntries(parsed);
      setLastRefreshed(new Date());
    } catch (err) {
      setError(getFriendlyError(err, "Failed to fetch contributions."));
    } finally {
      setLoading(false);
    }
  }, [contractAddress, contractABI, projectId, readOnlyRpcUrl]);

  useEffect(() => { fetchContributions(); }, [fetchContributions]);

  return (
    <div className="font-mono">
      <div className="relative bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl overflow-hidden shadow-2xl shadow-black/60">
        <div className="h-[3px] w-full bg-gradient-to-r from-[#a78bfa] via-[#00c8ff] to-[#00ffa3]" />
        <div className="p-4 md:px-7 md:py-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between md:gap-3 mb-4 md:mb-6">
            <div>
              <p className="text-[9px] md:text-[10px] tracking-[0.25em] uppercase text-[#a78bfa] mb-1">DLT · Immutable Audit Trail</p>
              <h2 className="text-lg md:text-xl font-bold text-white tracking-tight">Contribution Log</h2>
              <p className="text-[11px] md:text-[12px] text-[#555] mt-1">
                Project: <span className="text-[#888] font-semibold">{projectId}</span>
              </p>
            </div>
            <div className="flex flex-col items-start md:items-end gap-2 md:gap-1">
              <button onClick={fetchContributions} disabled={loading}
                className="flex items-center gap-1.5 text-[9px] md:text-[10px] tracking-widest uppercase text-[#555] hover:text-[#00ffa3] disabled:opacity-40 transition-colors">
                <svg className={`w-3 md:w-3.5 h-3 md:h-3.5 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582M20 20v-5h-.581M5.635 19A9 9 0 104.582 9" />
                </svg>
                Refresh
              </button>
              {lastRefreshed && (
                <p className="text-[8px] md:text-[10px] text-[#333]">
                  Last fetched {new Date(lastRefreshed.getTime() + 60 * 60 * 1000).toLocaleTimeString("en-GB", { hour12: false })} UTC+1
                </p>
              )}
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2.5 bg-red-950/30 border border-red-900/40 rounded-xl px-3 md:px-4 py-2.5 md:py-3 mb-4 md:mb-5">
              <span className="text-red-400 shrink-0 text-sm md:text-base">✕</span>
              <p className="text-red-400 text-xs md:text-xs leading-relaxed">{error}</p>
            </div>
          )}

          {loading && entries.length === 0 && (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-12 md:h-14 rounded-xl bg-[#111] border border-[#1a1a1a] animate-pulse"
                  style={{ animationDelay: `${i * 120}ms` }} />
              ))}
            </div>
          )}

          {!loading && !error && entries.length === 0 && (
            <div className="text-center py-8 md:py-12">
              <p className="text-[#444] text-xs md:text-sm">No contributions logged yet.</p>
              <p className="text-[#333] text-[10px] md:text-xs mt-1">Entries will appear here after the first on-chain log.</p>
            </div>
          )}

          {entries.length > 0 && (
            <>
              <div className="flex items-center gap-2 mb-3 md:mb-4">
                <span className="bg-[#00ffa3]/10 border border-[#00ffa3]/20 text-[#00ffa3] text-[8px] md:text-[10px] font-semibold tracking-widest uppercase px-2.5 md:px-3 py-0.5 md:py-1 rounded-full">
                  {entries.length} {entries.length === 1 ? "Entry" : "Entries"}
                </span>
                <div className="h-px flex-1 bg-[#1a1a1a]" />
              </div>

              {/* Desktop table */}
              <div className="hidden md:block w-full overflow-x-auto rounded-xl border border-[#1a1a1a]">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[#0a0a0a] border-b border-[#1a1a1a]">
                      {["#", "Contributor", "CRediT Role", "Evidence", "Timestamp", "Tx"].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-[9px] tracking-[0.2em] uppercase text-[#444] font-semibold whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry, idx) => (
                      <tr key={`${entry.txHash}-${idx}`} className="border-b border-[#111] hover:bg-[#0f0f0f] transition-colors">
                        <td className="px-4 py-3.5 text-[#333]">{idx + 1}</td>
                        <td className="px-4 py-3.5">
                          <span className="font-bold text-[#00ffa3] tracking-wider cursor-pointer"
                            title={entry.contributor}
                            onClick={() => navigator.clipboard?.writeText(entry.contributor)}>
                            {truncateAddress(entry.contributor)}
                          </span>
                        </td>
                        <td className="px-4 py-3.5"><RoleBadge role={entry.role} /></td>
                        <td className="px-4 py-3.5">
                          <a href={`${GATEWAY}/${entry.cid}`} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-[#00c8ff] hover:text-white transition-colors max-w-[140px]" title={entry.cid}>
                            <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                            <span className="truncate">{entry.cid.slice(0, 14)}…</span>
                          </a>
                        </td>
                        <td className="px-4 py-3.5 text-[#555] whitespace-nowrap text-[11px]">{formatTimestamp(entry.timestamp)}</td>
                        <td className="px-4 py-3.5">
                          <span className="text-[#a78bfa] cursor-pointer hover:text-white transition-colors"
                            title={entry.txHash}
                            onClick={() => navigator.clipboard?.writeText(entry.txHash)}>
                            {truncateAddress(entry.txHash)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-2">
                {entries.map((entry, idx) => (
                  <div key={`${entry.txHash}-${idx}-m`} className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-3 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <RoleBadge role={entry.role} />
                      <span className="text-[9px] text-[#333] shrink-0">#{idx + 1}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[10px]">
                      <div>
                        <p className="text-[8px] uppercase tracking-widest text-[#444] mb-0.5">Contributor</p>
                        <p className="text-[#00ffa3] font-bold cursor-pointer text-[11px] break-all"
                          onClick={() => navigator.clipboard?.writeText(entry.contributor)}>
                          {truncateAddress(entry.contributor)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[8px] uppercase tracking-widest text-[#444] mb-0.5">Timestamp</p>
                        <p className="text-[#555] text-[10px] leading-snug">{formatTimestamp(entry.timestamp)}</p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 pt-2 border-t border-[#1a1a1a]">
                      <a href={`${GATEWAY}/${entry.cid}`} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-[#00c8ff] text-[10px] hover:text-white transition-colors break-all">
                        <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        View Evidence
                      </a>
                      <span className="text-[#a78bfa] text-[10px] cursor-pointer hover:text-white break-all"
                        onClick={() => navigator.clipboard?.writeText(entry.txHash)}>
                        Tx: {truncateAddress(entry.txHash)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 md:mt-4 text-center text-[8px] md:text-[10px] text-[#2a2a2a]">
                All entries are immutable on-chain records. No scoring or weighting is applied.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
