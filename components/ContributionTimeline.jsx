"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { ethers } from "ethers";
import toast from "react-hot-toast";
import { getFriendlyError } from "@/utils/errorFormatter";
import {
  DEFAULT_FINALIZATION_DAYS,
  EVENT_QUERY_CHUNK_SIZE,
  POLL_INTERVAL,
  SECONDS_PER_DAY,
} from "./contribution-timeline/constants";
import EmptyLedgerState from "./contribution-timeline/EmptyLedgerState";
import FinalizationBanner from "./contribution-timeline/FinalizationBanner";
import TimelineEntry from "./contribution-timeline/TimelineEntry";
import TimelineHeader from "./contribution-timeline/TimelineHeader";
import TimelineSkeleton from "./contribution-timeline/TimelineSkeleton";
import { getContributionHash as buildContributionHash } from "./contribution-timeline/utils";

async function fetchLogsInRanges(contract, filter, fromBlock, toBlock) {
  let allLogs = [];
  for (let from = fromBlock; from <= toBlock; from += EVENT_QUERY_CHUNK_SIZE) {
    const to = Math.min(from + EVENT_QUERY_CHUNK_SIZE - 1, toBlock);
    const logs = await contract.queryFilter(filter, from, to);
    if (logs.length > 0) allLogs = allLogs.concat(logs);
  }
  return allLogs;
}

export default function ContributionTimeline({
  contractAddress,
  contractABI,
  projectId,
  readOnlyRpcUrl,
  refreshKey,
}) {
  const [entries, setEntries] = useState([]);
  const [newIds, setNewIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [isPolling, setIsPolling] = useState(false);
  const [profileCache, setProfileCache] = useState({});
  const [disputedEntries, setDisputedEntries] = useState({});
  const [finalizationStatus, setFinalizationStatus] = useState(null);
  const [isProjectAdmin, setIsProjectAdmin] = useState(false);
  const [finalizationDays, setFinalizationDays] = useState(DEFAULT_FINALIZATION_DAYS);
  const [flaggingDisputeKey, setFlaggingDisputeKey] = useState(null);

  const profileCacheRef = useRef({});
  const contractRef = useRef(null);
  const providerRef = useRef(null);
  const pollTimerRef = useRef(null);
  const prevCountRef = useRef(0);
  const isMountedRef = useRef(true);
  const pollInFlightRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  const eventQueriesDisabledRef = useRef(false);

  const abiString = useMemo(() => JSON.stringify(contractABI), [contractABI]);
  const supportsEditableFinalizationWindow = useMemo(() => {
    const initiate = contractABI?.find?.(
      item => item.type === "function" && item.name === "initiateFinalization"
    );
    return (initiate?.inputs?.length ?? 0) > 1;
  }, [contractABI]);

  const getProvider = useCallback(() => {
    if (readOnlyRpcUrl) return new ethers.JsonRpcProvider(readOnlyRpcUrl);
    if (typeof window !== "undefined" && window.ethereum) {
      return new ethers.BrowserProvider(window.ethereum);
    }
    throw new Error("No provider available.");
  }, [readOnlyRpcUrl]);

  const resolveProfiles = useCallback(async (addresses, contract) => {
    const currentCache = profileCacheRef.current;
    const unique = [...new Set(addresses)].filter(a => !(a in currentCache));
    if (unique.length === 0) return currentCache;

    const updates = { ...currentCache };
    await Promise.all(unique.map(async addr => {
      try {
        const p = await contract.getProfile(addr);
        updates[addr] = p.exists ? { name: p.name, orcid: p.orcid } : null;
      } catch {
        updates[addr] = null;
      }
    }));
    return updates;
  }, []);

  const fetchDisputeEvents = useCallback(async (contract, projId) => {
    if (eventQueriesDisabledRef.current) return {};

    try {
      const currentBlock = await contract.provider.getBlockNumber();
      const deployBlock = Number(process.env.NEXT_PUBLIC_DEPLOY_BLOCK || 10823551);
      const fromBlock = Math.max(deployBlock, 0);
      const allEvents = {};

      const filter = contract.filters.ContributionDisputed(projId);
      let logs = await fetchLogsInRanges(contract, filter, fromBlock, currentBlock);

      if (logs.length === 0) {
        const fallbackLogs = await fetchLogsInRanges(contract, contract.filters.ContributionDisputed(), fromBlock, currentBlock);
        logs = fallbackLogs.filter(log => log.args.projectId === projId);
      }

      logs.forEach(log => {
        allEvents[log.args.contributionHash] = log.args.reason;
      });

      return allEvents;
    } catch {
      eventQueriesDisabledRef.current = true;
      return {};
    }
  }, []);

  const fetchFinalizationStatus = useCallback(async (contract, projId) => {
    try {
      return await contract.getFinalizationStatus(projId);
    } catch {
      return null;
    }
  }, []);

  const checkIsProjectAdmin = useCallback(async (contract, projId) => {
    try {
      if (typeof window === "undefined" || !window.ethereum) return false;
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const userAddress = await signer.getAddress();
      return await contract.isProjectAdmin(projId, userAddress);
    } catch {
      return false;
    }
  }, []);

  const getWalletContract = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      throw new Error("MetaMask not found.");
    }

    const provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    const signer = await provider.getSigner();
    return new ethers.Contract(contractAddress, JSON.parse(abiString), signer);
  }, [contractAddress, abiString]);

  const initiateProjectFinalization = useCallback(async () => {
    const contract = await getWalletContract();
    if (!supportsEditableFinalizationWindow) {
      return contract.initiateFinalization(projectId);
    }

    const durationSeconds = BigInt(Math.round(Number(finalizationDays) * SECONDS_PER_DAY));
    return contract.initiateFinalization(projectId, durationSeconds);
  }, [finalizationDays, getWalletContract, projectId, supportsEditableFinalizationWindow]);

  const fetchHistory = useCallback(async (contract, provider, projId) => {
    let storedEntries = [];

    try {
      const stored = await contract.getContributions(projId);
      storedEntries = stored
        .map(item => ({
          contributor: item.contributor,
          cid: item.cid,
          role: item.creditRole,
          timestamp: item.timestamp,
          txHash: "",
        }))
        .sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
    } catch {
      storedEntries = [];
    }

    if (eventQueriesDisabledRef.current) return storedEntries;

    try {
      const currentBlock = await provider.getBlockNumber();
      const deployBlock = Number(process.env.NEXT_PUBLIC_DEPLOY_BLOCK || 10823551);
      const fromBlock = Math.max(deployBlock, 0);
      const primaryFilter = contract.filters.ContributionLogged(projId);
      let allLogs = await fetchLogsInRanges(contract, primaryFilter, fromBlock, currentBlock);

      if (allLogs.length === 0 && storedEntries.length > 0) {
        // Some RPC providers may not support filtering on string-indexed event topics reliably.
        // Retry by loading all ContributionLogged events in range and filtering client-side.
        const fallbackLogs = await fetchLogsInRanges(contract, contract.filters.ContributionLogged(), fromBlock, currentBlock);
        allLogs = fallbackLogs.filter(log => log.args.projectId === projId);
      }

      if (allLogs.length === 0) return storedEntries;

      const txByKey = new Map(
        allLogs.map(log => [
          `${log.args.contributor.toLowerCase()}-${log.args.timestamp.toString()}-${log.args.cid}`,
          log.transactionHash,
        ])
      );

      if (storedEntries.length > 0) {
        return storedEntries.map(entry => ({
          ...entry,
          txHash: txByKey.get(`${entry.contributor.toLowerCase()}-${entry.timestamp.toString()}-${entry.cid}`) ?? "",
        }));
      }

      return allLogs
        .map(log => ({
          contributor: log.args.contributor,
          cid: log.args.cid,
          role: log.args.creditRole,
          timestamp: log.args.timestamp,
          txHash: log.transactionHash,
        }))
        .sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
    } catch {
      eventQueriesDisabledRef.current = true;
      return storedEntries;
    }
  }, []);

  const poll = useCallback(async () => {
    if (!contractRef.current || !providerRef.current || !isMountedRef.current) return;
    if (pollInFlightRef.current) return;

    pollInFlightRef.current = true;
    try {
      const history = await fetchHistory(contractRef.current, providerRef.current, projectId);
      const prevCount = prevCountRef.current;

      if (history.length > prevCount && prevCount > 0) {
        const added = history.slice(0, history.length - prevCount);
        setNewIds(prev => {
          const s = new Set(prev);
          added.forEach(e => s.add(e.txHash + "-" + e.timestamp));
          return s;
        });
        added.forEach(e => {
          setTimeout(() => {
            setNewIds(prev => {
              const s = new Set(prev);
              s.delete(e.txHash + "-" + e.timestamp);
              return s;
            });
          }, 12000);
        });
        toast.success("New contribution logged on-chain.", {
          style: {
            background: "var(--paper)",
            border: "1px solid var(--rule)",
            color: "var(--accent)",
          },
        });
      }

      prevCountRef.current = history.length;
      setEntries(history);
      setLastRefreshed(new Date());

      const contributors = history.map(e => e.contributor);
      const uncached = [...new Set(contributors)].filter(a => !(a in profileCacheRef.current));
      if (uncached.length > 0) {
        resolveProfiles(contributors, contractRef.current)
          .then(updated => {
            if (isMountedRef.current) {
              profileCacheRef.current = updated;
              setProfileCache(updated);
            }
          })
          .catch(() => { });
      }

      const disputes = await fetchDisputeEvents(contractRef.current, projectId);
      if (isMountedRef.current) setDisputedEntries(disputes);

      const finStatus = await fetchFinalizationStatus(contractRef.current, projectId);
      if (isMountedRef.current) setFinalizationStatus(finStatus);

      const adminStatus = await checkIsProjectAdmin(contractRef.current, projectId);
      if (isMountedRef.current) setIsProjectAdmin(adminStatus);
    } catch { }
    finally {
      pollInFlightRef.current = false;
    }
  }, [
    checkIsProjectAdmin,
    fetchDisputeEvents,
    fetchFinalizationStatus,
    fetchHistory,
    projectId,
    resolveProfiles,
  ]);

  const refreshData = useCallback(async (fallbackMessage) => {
    if (!contractRef.current || !providerRef.current) return;
    if (refreshInFlightRef.current) return;

    refreshInFlightRef.current = true;
    setLoading(true);
    try {
      const h = await fetchHistory(contractRef.current, providerRef.current, projectId);
      if (!h) return;

      prevCountRef.current = h.length;
      setEntries(h);
      setLastRefreshed(new Date());
      setLoading(false);

      const contributors = h.map(e => e.contributor);
      const profileResult = await resolveProfiles(contributors, contractRef.current);
      if (isMountedRef.current) {
        profileCacheRef.current = profileResult;
        setProfileCache(profileResult);
      }

      const disputes = await fetchDisputeEvents(contractRef.current, projectId);
      if (isMountedRef.current) setDisputedEntries(disputes);

      const finStatus = await fetchFinalizationStatus(contractRef.current, projectId);
      if (isMountedRef.current) setFinalizationStatus(finStatus);

      const adminStatus = await checkIsProjectAdmin(contractRef.current, projectId);
      if (isMountedRef.current) setIsProjectAdmin(adminStatus);
    } catch (err) {
      setError(getFriendlyError(err, fallbackMessage));
      setLoading(false);
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [
    checkIsProjectAdmin,
    fetchDisputeEvents,
    fetchFinalizationStatus,
    fetchHistory,
    projectId,
    resolveProfiles,
  ]);

  useEffect(() => {
    setEntries([]);
    setLoading(true);
    setError("");
    setIsPolling(false);
    profileCacheRef.current = {};
    setProfileCache({});
    prevCountRef.current = 0;
    pollInFlightRef.current = false;
    refreshInFlightRef.current = false;
    eventQueriesDisabledRef.current = false;
    isMountedRef.current = true;
    clearInterval(pollTimerRef.current);

    const init = async () => {
      try {
        const provider = getProvider();
        providerRef.current = provider;

        const contract = new ethers.Contract(contractAddress, JSON.parse(abiString), provider);
        contractRef.current = contract;

        const history = await fetchHistory(contract, provider, projectId);
        if (!isMountedRef.current) return;

        prevCountRef.current = history.length;
        setEntries(history);
        setLastRefreshed(new Date());
        setLoading(false);
        setIsPolling(true);

        const contributors = history.map(e => e.contributor);
        const profileResult = await resolveProfiles(contributors, contract);
        if (isMountedRef.current) {
          profileCacheRef.current = profileResult;
          setProfileCache(profileResult);
        }

        const disputes = await fetchDisputeEvents(contract, projectId);
        if (isMountedRef.current) setDisputedEntries(disputes);

        const finStatus = await fetchFinalizationStatus(contract, projectId);
        if (isMountedRef.current) setFinalizationStatus(finStatus);

        const adminStatus = await checkIsProjectAdmin(contract, projectId);
        if (isMountedRef.current) setIsProjectAdmin(adminStatus);
      } catch (err) {
        if (isMountedRef.current) {
          setError(getFriendlyError(err, "Failed to load contributions."));
          setLoading(false);
        }
      }
    };

    init();

    return () => {
      isMountedRef.current = false;
      clearInterval(pollTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractAddress, abiString, projectId]);

  useEffect(() => {
    if (!isPolling) return;

    pollTimerRef.current = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(pollTimerRef.current);
  }, [isPolling, poll]);

  useEffect(() => {
    if (!refreshKey || refreshKey === 0) return;
    if (!contractRef.current || !providerRef.current) return;

    const t = setTimeout(() => {
      refreshData("Refresh failed.");
    }, 2500);

    return () => clearTimeout(t);
  }, [refreshKey, refreshData]);

  const handleRefresh = useCallback(() => {
    refreshData("Refresh failed.");
  }, [refreshData]);

  const handleHaltFinalization = useCallback(async () => {
    try {
      setLoading(true);
      const contract = await getWalletContract();
      const tx = await contract.haltFinalization(projectId);
      await tx.wait();
      toast.success("Finalization halted!");
      setTimeout(() => poll(), 1000);
    } catch (err) {
      toast.error(getFriendlyError(err, "Failed to halt finalization."));
    } finally {
      setLoading(false);
    }
  }, [getWalletContract, poll, projectId]);

  const handleInitiateFinalization = useCallback(async () => {
    try {
      setLoading(true);
      const tx = await initiateProjectFinalization();
      await tx.wait();
      toast.success(
        supportsEditableFinalizationWindow
          ? `Finalization initiated! ${finalizationDays}-day countdown started.`
          : "Finalization initiated! Contract countdown started."
      );
      setTimeout(() => poll(), 1000);
    } catch (err) {
      toast.error(getFriendlyError(err, "Failed to initiate finalization."));
    } finally {
      setLoading(false);
    }
  }, [
    finalizationDays,
    initiateProjectFinalization,
    poll,
    supportsEditableFinalizationWindow,
  ]);

  const getContributionHash = useCallback((contributor, timestamp) => {
    return buildContributionHash(projectId, contributor, timestamp);
  }, [projectId]);

  const handleFlagDispute = useCallback(async (entry, reason) => {
    const cleanReason = reason.trim();
    if (!cleanReason) {
      toast.error("Please enter a dispute reason.");
      return false;
    }

    const key = (entry.txHash || entry.cid) + "-" + entry.timestamp;
    setFlaggingDisputeKey(key);
    try {
      const contract = await getWalletContract();
      const tx = await contract.flagContributionAsDisputed(
        projectId,
        entry.contributor,
        entry.timestamp,
        cleanReason
      );
      await tx.wait();

      const hash = getContributionHash(entry.contributor, entry.timestamp);
      setDisputedEntries(prev => ({ ...prev, [hash]: cleanReason }));
      toast.success("Contribution flagged as disputed.");
      setTimeout(() => poll(), 1000);
      return true;
    } catch (err) {
      toast.error(getFriendlyError(err, "Failed to flag contribution."));
      return false;
    } finally {
      setFlaggingDisputeKey(null);
    }
  }, [getContributionHash, getWalletContract, poll, projectId]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", minWidth: 0 }}>
      <style>{`
        @keyframes slideIn { from { opacity: 0; transform: translateY(-10px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
      `}</style>

      <FinalizationBanner
        finalizationStatus={finalizationStatus}
        loading={loading}
        onHalt={handleHaltFinalization}
      />

      <div style={{
        border: "1px solid var(--rule)",
        borderRadius: "8px",
        overflow: "hidden",
        background: finalizationStatus?.isFinalized ? "#F0FDF4" : "var(--paper)",
      }}>
        <div style={{
          height: "2px",
          background: finalizationStatus?.isFinalized ? "#15803D" : "var(--indigo)",
        }} />
        <div style={{ padding: "22px" }}>
          <TimelineHeader
            projectId={projectId}
            loading={loading}
            isPolling={isPolling}
            isProjectAdmin={isProjectAdmin}
            finalizationStatus={finalizationStatus}
            finalizationDays={finalizationDays}
            supportsEditableFinalizationWindow={supportsEditableFinalizationWindow}
            lastRefreshed={lastRefreshed}
            onRefresh={handleRefresh}
            onFinalizationDaysChange={setFinalizationDays}
            onInitiateFinalization={handleInitiateFinalization}
          />

          {entries.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
              <span style={{
                background: finalizationStatus?.isFinalized ? "#DCFCE7" : "var(--indigo-bg)",
                color: finalizationStatus?.isFinalized ? "#15803D" : "var(--indigo)",
                border: finalizationStatus?.isFinalized ? "1px solid #86EFAC" : "1px solid #C5CAE9",
                fontFamily: "var(--font-geist-mono)",
                fontSize: "10px",
                fontWeight: 700,
                padding: "2px 10px",
                borderRadius: "4px",
              }}>
                {entries.length} {entries.length === 1 ? "record" : "records"}
              </span>
              <div style={{ height: "1px", flex: 1, background: "var(--rule-light)" }} />
            </div>
          )}

          {error && (
            <div style={{
              background: "var(--danger-bg)",
              border: "1px solid #F5C6CB",
              color: "var(--danger)",
              borderRadius: "6px",
              padding: "9px 12px",
              fontSize: "12px",
              marginBottom: "12px",
              display: "flex",
              gap: "8px",
            }}>
              <span>x</span>
              <span style={{ lineHeight: 1.5 }}>{error}</span>
            </div>
          )}

          {loading && entries.length === 0 && <TimelineSkeleton />}
          {!loading && !error && entries.length === 0 && <EmptyLedgerState />}

          {entries.length > 0 && (
            <div>
              {entries.map(entry => {
                const key = (entry.txHash || entry.cid) + "-" + entry.timestamp;
                const hash = getContributionHash(entry.contributor, entry.timestamp);
                const isDisputed = !!disputedEntries[hash];
                const disputeReason = disputedEntries[hash] || null;

                return (
                  <TimelineEntry
                    key={key}
                    entry={entry}
                    isNew={newIds.has(key)}
                    profile={profileCache[entry.contributor]}
                    isDisputed={isDisputed}
                    disputeReason={disputeReason}
                    isProjectFinalized={finalizationStatus?.isFinalized}
                    isProjectAdmin={isProjectAdmin}
                    isFlagging={flaggingDisputeKey === key}
                    onFlagDispute={handleFlagDispute}
                  />
                );
              })}
              <p style={{
                textAlign: "center",
                fontFamily: "var(--font-geist-mono)",
                fontSize: "10px",
                color: finalizationStatus?.isFinalized ? "#15803D" : "var(--ink-4)",
                borderTop: "1px solid var(--rule-light)",
                paddingTop: "12px",
              }}>
                {finalizationStatus?.isFinalized
                  ? "All records are permanently sealed and immutable."
                  : "All records are append-only and immutable. No scoring applied."
                }
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
