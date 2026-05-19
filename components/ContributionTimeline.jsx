
"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { ethers } from "ethers";
import toast from "react-hot-toast";
import { getFriendlyError } from "@/utils/errorFormatter";
import {
  DEFAULT_FINALIZATION_DAYS,
  EVENT_QUERY_CHUNK_SIZE,
  MIN_EVENT_QUERY_CHUNK_SIZE,
  POLL_INTERVAL,
  SECONDS_PER_DAY,
} from "./contribution-timeline/constants";
import EmptyLedgerState from "./contribution-timeline/EmptyLedgerState";
import FinalizationBanner from "./contribution-timeline/FinalizationBanner";
import TimelineEntry from "./contribution-timeline/TimelineEntry";
import TimelineHeader from "./contribution-timeline/TimelineHeader";
import TimelineSkeleton from "./contribution-timeline/TimelineSkeleton";
import { getContributionHash as buildContributionHash } from "./contribution-timeline/utils";

// ---------------------------------------------------------------------------
// fetchLogsInRanges — chunked log query with binary-split fallback
// Uses large chunks (2000 blocks) so a typical Sepolia deployment only needs
// a handful of RPC calls instead of hundreds.
// ---------------------------------------------------------------------------
async function fetchLogsInRanges(provider, contract, filter, fromBlock, toBlock) {
  const contractAddress = contract.target ?? contract.address;
  const filterParams = {
    address: contractAddress,
    topics: filter?.topics,
  };

  async function parseRawLogs(rawLogs) {
    return rawLogs.map(log => {
      const parsed = contract.interface.parseLog(log);
      return {
        ...log,
        ...parsed,
      };
    });
  }

  async function queryRange(start, end, chunkSize) {
    if (start > end) return [];
    try {
      return await contract.queryFilter(filter, start, end);
    } catch (err) {
      if (chunkSize <= MIN_EVENT_QUERY_CHUNK_SIZE) {
        const rawLogs = await provider.getLogs({
          ...filterParams,
          fromBlock: start,
          toBlock: end,
        });
        return await parseRawLogs(rawLogs);
      }
      const nextSize = Math.max(MIN_EVENT_QUERY_CHUNK_SIZE, Math.floor(chunkSize / 2));
      const boundary = Math.min(start + nextSize - 1, end);
      const left = await queryRange(start, boundary, nextSize);
      const right = await queryRange(boundary + 1, end, nextSize);
      return [...left, ...right];
    }
  }

  let allLogs = [];
  for (let from = fromBlock; from <= toBlock; from += EVENT_QUERY_CHUNK_SIZE) {
    const to = Math.min(from + EVENT_QUERY_CHUNK_SIZE - 1, toBlock);
    const logs = await queryRange(from, to, EVENT_QUERY_CHUNK_SIZE);
    if (logs.length > 0) allLogs = allLogs.concat(logs);
  }
  return allLogs;
}

function matchesIndexedProjectId(log, projectId) {
  if (!log || !log.topics) return false;
  const projectIdTopic = ethers.id(projectId);
  return log.topics[1] === projectIdTopic || log.args?.projectId === projectId;
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
  const [isProjectAuthorized, setIsProjectAuthorized] = useState(false);
  const [hasUsedStrike, setHasUsedStrike] = useState(false);
  const [supportsAuthorizedDispute, setSupportsAuthorizedDispute] = useState(true);
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
  const entriesRef = useRef([]);
  // disputedEntriesRef is the single source of truth — never overwrite a real
  // reason with an empty string (guards against poll races).
  const disputedEntriesRef = useRef({});

  const updateEntries = useCallback((nextEntries) => {
    entriesRef.current = nextEntries;
    setEntries(nextEntries);
  }, []);

  // mergeDisputedEntries only writes; it never deletes keys and never
  // overwrites a non-empty reason with an empty one.
  const mergeDisputedEntries = useCallback((updates) => {
    let changed = false;
    const next = { ...disputedEntriesRef.current };
    Object.entries(updates).forEach(([key, value]) => {
      const existing = next[key];
      const hasGoodReason = typeof existing === "string" && existing.length > 0;
      const incomingIsEmpty = typeof value !== "string" || value.length === 0;
      if (hasGoodReason && incomingIsEmpty) return; // never overwrite a real reason
      if (next[key] !== (value ?? "")) {
        next[key] = value ?? "";
        changed = true;
      }
    });
    if (changed) {
      disputedEntriesRef.current = next;
      setDisputedEntries(next);
    }
  }, []);

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

  // ---------------------------------------------------------------------------
  // fetchDisputeEvents — fetches ContributionDisputed events once and merges.
  // Avoids a per-entry checkIfDisputed loop (which was very slow); falls back
  // to the boolean check only for entries whose hash is still unknown.
  // ---------------------------------------------------------------------------
  const fetchDisputeEvents = useCallback(async (contract, projId, entries = []) => {
    const allEvents = {};

    if (!eventQueriesDisabledRef.current) {
      let attempt = 0;
      const maxAttempts = 3;
      while (attempt < maxAttempts) {
        try {
          const currentBlock = await contract.provider.getBlockNumber();
          const deployBlock = Number(process.env.NEXT_PUBLIC_DEPLOY_BLOCK || 10823551);
          const fromBlock = Math.max(deployBlock, 0);

          let allLogs = [];
          try {
            allLogs = await contract.queryFilter(
              contract.filters.ContributionDisputed(),
              fromBlock,
              currentBlock
            );
          } catch {
            allLogs = await fetchLogsInRanges(
              contract.provider,
              contract,
              contract.filters.ContributionDisputed(),
              fromBlock,
              currentBlock
            );
          }

          allLogs
            .filter(log => matchesIndexedProjectId(log, projId))
            .forEach(log => {
              const hash = log.args.contributionHash;
              const reason = typeof log.args.reason === "string" ? log.args.reason : "";
              if (!(hash in allEvents) || (allEvents[hash] === "" && reason !== "")) {
                allEvents[hash] = reason;
              }
            });

          break;
        } catch (err) {
          attempt++;
          if (attempt >= maxAttempts) {
            eventQueriesDisabledRef.current = true;
          } else {
            await new Promise(res => setTimeout(res, attempt * 1000));
          }
        }
      }
    }

    // Boolean fallback only for entries not already resolved via events.
    // Skip this entirely if we already know about all hashes to avoid
    // N extra RPC calls on every poll.
    const unknownEntries = entries.filter(entry => {
      const hash = buildContributionHash(projId, entry.contributor, entry.timestamp);
      return !(hash in allEvents) && !(hash in disputedEntriesRef.current);
    });

    if (unknownEntries.length > 0) {
      await Promise.all(unknownEntries.map(async (entry) => {
        try {
          const hash = buildContributionHash(projId, entry.contributor, entry.timestamp);
          const disputed = await contract.checkIfDisputed(
            projId, entry.contributor, entry.timestamp
          );
          if (disputed) allEvents[hash] = allEvents[hash] ?? "";
        } catch {
          // ignore
        }
      }));
    }

    return allEvents;
  }, []);

  const fetchFinalizationStatus = useCallback(async (contract, projId) => {
    try {
      return await contract.getFinalizationStatus(projId);
    } catch {
      return null;
    }
  }, []);

  const getWalletAddress = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      throw new Error("MetaMask not found.");
    }
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    return await signer.getAddress();
  }, []);

  const checkIsProjectAdmin = useCallback(async (contract, projId) => {
    try {
      const userAddress = await getWalletAddress();
      return await contract.isProjectAdmin(projId, userAddress);
    } catch {
      return false;
    }
  }, [getWalletAddress]);

  const checkIsAuthorized = useCallback(async (contract, projId) => {
    try {
      const userAddress = await getWalletAddress();
      if (await contract.isProjectAdmin(projId, userAddress)) {
        return true;
      }
      return await contract.isAuthorized(projId, userAddress);
    } catch {
      return false;
    }
  }, [getWalletAddress]);

  const checkHasDisputed = useCallback(async (contract, projId) => {
    try {
      const userAddress = await getWalletAddress();
      if (typeof contract.hasDisputed !== "function") return false;
      return await contract.hasDisputed(projId, userAddress);
    } catch {
      return false;
    }
  }, [getWalletAddress]);

  const checkSupportsAuthorizedDispute = useCallback(async (provider, contractAddr) => {
    try {
      const code = await provider.getCode(contractAddr);
      const selector = ethers.id("disputeContribution(string,address,uint256,string)").slice(2, 10);
      return code.includes(selector);
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

  // ---------------------------------------------------------------------------
  // fetchHistory — prefers getContributions() (one RPC call) for the entry
  // list, then does a single event query to attach tx hashes.
  // ---------------------------------------------------------------------------
  const fetchHistory = useCallback(async (contract, provider, projId, { includeTxHashes = true } = {}) => {
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

    // Build lookup maps from previously cached tx hashes so we don't lose them
    // across re-fetches (e.g. when polling returns entries without txHash).
    const previousTxByKey = new Map(
      entriesRef.current.map(entry => [
        `${entry.contributor.toLowerCase()}-${entry.timestamp.toString()}-${entry.cid}`,
        entry.txHash,
      ])
    );
    const previousTxByContributorTimestamp = new Map(
      entriesRef.current.map(entry => [
        `${entry.contributor.toLowerCase()}-${entry.timestamp.toString()}`,
        entry.txHash,
      ])
    );

    const restoreTxHash = (entry) => {
      const exactKey = `${entry.contributor.toLowerCase()}-${entry.timestamp.toString()}-${entry.cid}`;
      const fallbackKey = `${entry.contributor.toLowerCase()}-${entry.timestamp.toString()}`;
      return (
        previousTxByKey.get(exactKey)
        ?? previousTxByContributorTimestamp.get(fallbackKey)
        ?? ""
      );
    };

    if (!includeTxHashes || eventQueriesDisabledRef.current) {
      return storedEntries.map(entry => ({ ...entry, txHash: restoreTxHash(entry) }));
    }

    // Only attempt event queries if we don't already have all tx hashes cached.
    const needsTxHash = storedEntries.some(e => !restoreTxHash(e));

    if (!needsTxHash) {
      return storedEntries.map(entry => ({ ...entry, txHash: restoreTxHash(entry) }));
    }

    try {
      const currentBlock = await provider.getBlockNumber();
      const deployBlock = Number(process.env.NEXT_PUBLIC_DEPLOY_BLOCK || 10823551);
      const fromBlock = Math.max(deployBlock, 0);

      const primaryFilter = contract.filters.ContributionLogged(projId);
      let allLogs = await fetchLogsInRanges(
        provider,
        contract,
        primaryFilter,
        fromBlock,
        currentBlock
      );

      if (allLogs.length === 0 && storedEntries.length > 0) {
        const fallbackLogs = await fetchLogsInRanges(
          provider,
          contract,
          contract.filters.ContributionLogged(),
          fromBlock,
          currentBlock
        );
        allLogs = fallbackLogs.filter(log => matchesIndexedProjectId(log, projId));
      }

      const txByKey = new Map(
        allLogs.map(log => [
          `${log.args.contributor.toLowerCase()}-${log.args.timestamp.toString()}-${log.args.cid}`,
          log.transactionHash,
        ])
      );
      const txByContributorTimestamp = new Map(
        allLogs.map(log => [
          `${log.args.contributor.toLowerCase()}-${log.args.timestamp.toString()}`,
          log.transactionHash,
        ])
      );

      if (storedEntries.length > 0) {
        return storedEntries.map(entry => {
          const exactKey = `${entry.contributor.toLowerCase()}-${entry.timestamp.toString()}-${entry.cid}`;
          const fallbackKey = `${entry.contributor.toLowerCase()}-${entry.timestamp.toString()}`;
          return {
            ...entry,
            txHash:
              txByKey.get(exactKey)
              ?? txByContributorTimestamp.get(fallbackKey)
              ?? restoreTxHash(entry),
          };
        });
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
      return storedEntries.map(entry => ({ ...entry, txHash: restoreTxHash(entry) }));
    }
  }, []);

  // ---------------------------------------------------------------------------
  // poll — lightweight: only re-fetches contributions + finalization.
  // Dispute data is NOT re-fetched on every poll; it is only updated when a
  // new entry appears (count changes) or when explicitly refreshed. This
  // prevents the poll from racing with and clobbering dispute reasons.
  // ---------------------------------------------------------------------------
  const poll = useCallback(async () => {
    if (!contractRef.current || !providerRef.current || !isMountedRef.current) return;
    if (pollInFlightRef.current) return;

    pollInFlightRef.current = true;
    try {
      const history = await fetchHistory(contractRef.current, providerRef.current, projectId, { includeTxHashes: false });
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

        // New entries appeared — refresh dispute data for only the new ones.
        if (contractRef.current) {
          const disputes = await fetchDisputeEvents(contractRef.current, projectId, added);
          if (isMountedRef.current) mergeDisputedEntries(disputes);
        }
      }

      prevCountRef.current = history.length;
      updateEntries(history);
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

      const finStatus = await fetchFinalizationStatus(contractRef.current, projectId);
      if (isMountedRef.current) setFinalizationStatus(finStatus);

      const [adminStatus, authorizedStatus, strikeStatus] = await Promise.all([
        checkIsProjectAdmin(contractRef.current, projectId),
        checkIsAuthorized(contractRef.current, projectId),
        checkHasDisputed(contractRef.current, projectId),
      ]);

      if (isMountedRef.current) {
        setIsProjectAdmin(adminStatus);
        setIsProjectAuthorized(authorizedStatus);
        setHasUsedStrike(strikeStatus);
      }
    } catch { }
    finally {
      pollInFlightRef.current = false;
    }
  }, [
    checkIsProjectAdmin,
    fetchDisputeEvents,
    fetchFinalizationStatus,
    fetchHistory,
    mergeDisputedEntries,
    projectId,
    resolveProfiles,
    updateEntries,
  ]);

  // ---------------------------------------------------------------------------
  // refreshData — full refresh including disputes (triggered manually or via
  // refreshKey). Dispute reasons fetched here are merged additively so they
  // are never lost.
  // ---------------------------------------------------------------------------
  const refreshData = useCallback(async (fallbackMessage) => {
    if (!contractRef.current || !providerRef.current) return;
    if (refreshInFlightRef.current) return;

    refreshInFlightRef.current = true;
    setLoading(true);
    try {
      const h = await fetchHistory(contractRef.current, providerRef.current, projectId, { includeTxHashes: false });
      if (!h) return;

      prevCountRef.current = h.length;
      updateEntries(h);
      setLastRefreshed(new Date());
      setLoading(false);

      const contributors = h.map(e => e.contributor);
      const profileResult = await resolveProfiles(contributors, contractRef.current);
      if (isMountedRef.current) {
        profileCacheRef.current = profileResult;
        setProfileCache(profileResult);
      }

      const disputes = await fetchDisputeEvents(contractRef.current, projectId, h);
      if (isMountedRef.current) mergeDisputedEntries(disputes);

      const finStatus = await fetchFinalizationStatus(contractRef.current, projectId);
      if (isMountedRef.current) setFinalizationStatus(finStatus);

      const [adminStatus, authorizedStatus, strikeStatus] = await Promise.all([
        checkIsProjectAdmin(contractRef.current, projectId),
        checkIsAuthorized(contractRef.current, projectId),
        checkHasDisputed(contractRef.current, projectId),
      ]);
      if (isMountedRef.current) {
        setIsProjectAdmin(adminStatus);
        setIsProjectAuthorized(authorizedStatus);
        setHasUsedStrike(strikeStatus);
      }
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
    mergeDisputedEntries,
    projectId,
    resolveProfiles,
    updateEntries,
  ]);

  // ---------------------------------------------------------------------------
  // Initialisation effect — runs once per projectId change.
  // Sequence: contributions first (renders quickly), then profiles + disputes
  // in parallel, then start polling.
  // ---------------------------------------------------------------------------
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
        const supportsAuthorized = await checkSupportsAuthorizedDispute(provider, contractAddress);
        setSupportsAuthorizedDispute(supportsAuthorized);

        // ── Step 1: fetch contribution list (fast — one eth_call) ──────────
        const history = await fetchHistory(contract, provider, projectId, { includeTxHashes: false });
        if (!isMountedRef.current) return;

        prevCountRef.current = history.length;
        updateEntries(history);
        setLastRefreshed(new Date());
        setLoading(false); // show entries immediately, before slower queries

        // Fill tx hashes in the background so the initial render is not blocked
        (async () => {
          try {
            const fullHistory = await fetchHistory(contract, provider, projectId, { includeTxHashes: true });
            if (!isMountedRef.current) return;
            updateEntries(fullHistory);
            prevCountRef.current = fullHistory.length;
          } catch {
            // ignore background fill failures
          }
        })();

        // ── Step 2: profiles + disputes + finalization in parallel ──────────
        const contributors = history.map(e => e.contributor);

        const [profileResult, disputes, finStatus, adminStatus, authorizedStatus, strikeStatus] = await Promise.allSettled([
          resolveProfiles(contributors, contract),
          fetchDisputeEvents(contract, projectId, history),
          fetchFinalizationStatus(contract, projectId),
          checkIsProjectAdmin(contract, projectId),
          checkIsAuthorized(contract, projectId),
          checkHasDisputed(contract, projectId),
        ]);

        if (!isMountedRef.current) return;

        if (profileResult.status === "fulfilled") {
          profileCacheRef.current = profileResult.value;
          setProfileCache(profileResult.value);
        }
        if (disputes.status === "fulfilled") {
          mergeDisputedEntries(disputes.value);
        }
        if (finStatus.status === "fulfilled") {
          setFinalizationStatus(finStatus.value);
        }
        if (adminStatus.status === "fulfilled") {
          setIsProjectAdmin(adminStatus.value);
        }
        if (authorizedStatus.status === "fulfilled") {
          setIsProjectAuthorized(authorizedStatus.value);
        }
        if (strikeStatus.status === "fulfilled") {
          setHasUsedStrike(strikeStatus.value);
        }

        // Start polling only after all initial data is loaded so the first
        // poll doesn't race with dispute state.
        if (isMountedRef.current) setIsPolling(true);

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
      const tx = await (supportsAuthorizedDispute && typeof contract.disputeContribution === "function"
        ? contract.disputeContribution(projectId, entry.contributor, entry.timestamp, cleanReason)
        : contract.flagContributionAsDisputed(projectId, entry.contributor, entry.timestamp, cleanReason)
      );
      await tx.wait();

      const hash = getContributionHash(entry.contributor, entry.timestamp);
      mergeDisputedEntries({ [hash]: cleanReason });
      setHasUsedStrike(true);
      toast.success("Contribution flagged as disputed.");
      setTimeout(() => poll(), 1000);
      return true;
    } catch (err) {
      toast.error(getFriendlyError(err, "Failed to flag contribution."));
      return false;
    } finally {
      setFlaggingDisputeKey(null);
    }
  }, [getContributionHash, getWalletContract, mergeDisputedEntries, poll, projectId]);

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

          {!supportsAuthorizedDispute && (
            <div style={{
              background: "#FFF7ED",
              border: "1px solid #FBBF24",
              color: "#92400E",
              borderRadius: "6px",
              padding: "12px 14px",
              fontSize: "12px",
              marginBottom: "12px",
            }}>
              This deployed contract version does not yet support authorized collaborator disputes. Only project admins can flag disputes until the contract is upgraded.
            </div>
          )}

          {loading && entries.length === 0 && <TimelineSkeleton />}
          {!loading && !error && entries.length === 0 && <EmptyLedgerState />}

          {entries.length > 0 && (
            <div>
              {entries.map(entry => {
                const key = (entry.txHash || entry.cid) + "-" + entry.timestamp;
                const hash = getContributionHash(entry.contributor, entry.timestamp);
                const isDisputed = Object.prototype.hasOwnProperty.call(disputedEntries, hash);
                const disputeReason = disputedEntries[hash] || null;
                const canDispute = !isDisputed
                  && !finalizationStatus?.isFinalized
                  && !hasUsedStrike
                  && (isProjectAdmin || (supportsAuthorizedDispute && isProjectAuthorized));

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
                    canDispute={canDispute}
                    hasUsedStrike={hasUsedStrike}
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