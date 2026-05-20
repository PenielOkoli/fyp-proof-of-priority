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
import ProofOfPriorityReceipt from "./contribution-timeline/ProofOfPriorityReceipt";
import TimelineEntry from "./contribution-timeline/TimelineEntry";
import TimelineHeader from "./contribution-timeline/TimelineHeader";
import TimelineSkeleton from "./contribution-timeline/TimelineSkeleton";
import { getContributionHash as buildContributionHash } from "./contribution-timeline/utils";

const BACKOFF_INITIAL_MS = 2000;
const BACKOFF_MAX_MS = 30000;
const MAX_BACKOFF_RETRIES = 10;
const EVENT_LOOKBACK_BLOCKS = 100;
const TX_HASH_CACHE_PREFIX = "proof-of-priority:tx-hashes";
const MAX_TX_HASH_BACKFILLS_PER_REFRESH = 10;

// ---------------------------------------------------------------------------
// fetchLogsInRanges — chunked log query with binary-split fallback
// ---------------------------------------------------------------------------
async function fetchLogsInRanges(provider, contract, filter, rawTopics, fromBlock, toBlock) {
  const contractAddress = contract.target ?? contract.address;
  const filterTopics = rawTopics ?? filter?.topics;
  const filterParams = {
    address: contractAddress,
    topics: filterTopics,
  };

  async function parseRawLogs(rawLogs) {
    return rawLogs.map(log => {
      const parsed = contract.interface.parseLog(log);
      return { ...log, ...parsed };
    });
  }

  async function queryRange(start, end, chunkSize) {
    if (start > end) return [];
    try {
      return await contract.queryFilter(filter, start, end);
    } catch {
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

function getContributionStorageKey(entry) {
  if (!entry?.contributor || !entry?.cid || entry?.timestamp == null) return "";
  return `${entry.contributor.toLowerCase()}-${entry.timestamp.toString()}-${entry.cid}`;
}

export default function ContributionTimeline({
  contractAddress,
  contractABI,
  projectId,
  readOnlyRpcUrl,
  refreshKey,
  confirmedContribution,
  onFinalizationStatusChange, // NEW: lifted up to page.tsx
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
  const [projectReceipt, setProjectReceipt] = useState(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const profileCacheRef = useRef({});
  const contractRef = useRef(null);
  const providerRef = useRef(null);
  const pollTimerRef = useRef(null);
  const confirmationTimerRef = useRef(null);
  const actionTimerRef = useRef(null);
  const newIdsTimersRef = useRef([]);
  const prevCountRef = useRef(0);
  const isMountedRef = useRef(true);
  const pollInFlightRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  const eventQueriesDisabledRef = useRef(false);
  const entriesRef = useRef([]);
  const disputedEntriesRef = useRef({});
  const confirmedTxByContributionRef = useRef(new Map());
  const pendingConfirmationRef = useRef(null);
  const confirmationAttemptRef = useRef(0);

  // Helper: update finalization status locally AND notify parent
  const applyFinalizationStatus = useCallback((status) => {
    setFinalizationStatus(status);
    onFinalizationStatusChange?.(status);
  }, [onFinalizationStatusChange]);

  const getContributionSeedKey = useCallback((contributor, cid) => {
    if (!contributor || !cid) return "";
    return `${contributor.toLowerCase()}-${cid}`;
  }, []);

  const getTxHashCacheStorageKey = useCallback((projId) => {
    return `${TX_HASH_CACHE_PREFIX}:${contractAddress}:${projId}`;
  }, [contractAddress]);

  const readTxHashCache = useCallback((projId) => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(getTxHashCacheStorageKey(projId));
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }, [getTxHashCacheStorageKey]);

  const writeTxHashCache = useCallback((projId, updates) => {
    if (typeof window === "undefined" || Object.keys(updates).length === 0) return;
    try {
      const next = { ...readTxHashCache(projId), ...updates };
      window.localStorage.setItem(getTxHashCacheStorageKey(projId), JSON.stringify(next));
    } catch {
      // localStorage can be unavailable in private contexts; the in-memory state still works.
    }
  }, [getTxHashCacheStorageKey, readTxHashCache]);

  const updateEntries = useCallback((nextEntries) => {
    entriesRef.current = nextEntries;
    setEntries(nextEntries);
  }, []);

  const clearConfirmationTimer = useCallback(() => {
    if (confirmationTimerRef.current) {
      clearTimeout(confirmationTimerRef.current);
      confirmationTimerRef.current = null;
    }
  }, []);

  const clearActionTimer = useCallback(() => {
    if (actionTimerRef.current) {
      clearTimeout(actionTimerRef.current);
      actionTimerRef.current = null;
    }
  }, []);

  const clearNewIdsTimers = useCallback(() => {
    newIdsTimersRef.current.forEach(clearTimeout);
    newIdsTimersRef.current = [];
  }, []);

  const seedConfirmedContribution = useCallback((confirmed) => {
    if (!confirmed?.txHash) return;
    const seedKey = getContributionSeedKey(confirmed.contributor, confirmed.cid);
    if (seedKey) confirmedTxByContributionRef.current.set(seedKey, confirmed.txHash);
  }, [getContributionSeedKey]);

  const clearCachedProfile = useCallback((address) => {
    if (!address) return;
    const target = address.toLowerCase();
    const next = { ...profileCacheRef.current };
    Object.keys(next).forEach(key => {
      if (key.toLowerCase() === target) delete next[key];
    });
    profileCacheRef.current = next;
    setProfileCache(next);
  }, []);

  const isPendingContributionConfirmed = useCallback(() => {
    const pending = pendingConfirmationRef.current;
    if (!pending) return true;

    const matchingEntry = entriesRef.current.find(entry => {
      const sameCid = pending.cid && entry.cid === pending.cid;
      const sameContributor = pending.contributor
        && entry.contributor?.toLowerCase() === pending.contributor.toLowerCase();
      return sameCid && sameContributor;
    });
    const profileResolved = !pending.contributor
      || Object.keys(profileCacheRef.current).some(key => key.toLowerCase() === pending.contributor.toLowerCase());

    return Boolean(matchingEntry?.txHash) && profileResolved;
  }, []);

  const mergeDisputedEntries = useCallback((updates) => {
    let changed = false;
    const next = { ...disputedEntriesRef.current };
    Object.entries(updates).forEach(([key, value]) => {
      const existing = next[key];
      const hasGoodReason = typeof existing === "string" && existing.length > 0;
      const incomingIsEmpty = typeof value !== "string" || value.length === 0;
      if (hasGoodReason && incomingIsEmpty) return;
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
  const executeFinalizationInputs = useMemo(() => {
    const execute = contractABI?.find?.(
      item => item.type === "function" && item.name === "executeFinalization"
    );
    return execute?.inputs?.length ?? 0;
  }, [contractABI]);
  const supportsProjectReceiptGetter = useMemo(() => (
    Boolean(contractABI?.some?.(item => item.type === "function" && item.name === "getProjectReceipt"))
  ), [contractABI]);
  const isDeadlinePassed = useCallback((status) => {
    return Boolean(
      status?.isFinalizationActive
      && !status?.isFinalized
      && status?.finalizationDeadline
      && Number(status.finalizationDeadline) * 1000 <= nowMs
    );
  }, [nowMs]);
  const isProjectSealedOrLocked = Boolean(finalizationStatus?.isFinalized || isDeadlinePassed(finalizationStatus));

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

  const fetchDisputeEvents = useCallback(async (contract, projId, entries = []) => {
    const allEvents = {};

    if (!eventQueriesDisabledRef.current) {
      let attempt = 0;
      const maxAttempts = 3;
      while (attempt < maxAttempts) {
        try {
          const currentBlock = await contract.provider.getBlockNumber();
          const deployBlock = Number(process.env.NEXT_PUBLIC_DEPLOY_BLOCK || 10823551);
          const fromBlock = Math.max(deployBlock, currentBlock - EVENT_LOOKBACK_BLOCKS, 0);
          const eventTopic = ethers.id("ContributionDisputed(string,address,uint256,string)");

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
              [eventTopic],
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
        } catch {
          attempt++;
          if (attempt >= maxAttempts) {
            eventQueriesDisabledRef.current = true;
          } else {
            await new Promise(res => setTimeout(
              res,
              Math.min(BACKOFF_INITIAL_MS * (2 ** (attempt - 1)), BACKOFF_MAX_MS)
            ));
          }
        }
      }
    }

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

  const buildLocalReceipt = useCallback((status, history) => {
    if (!status?.isFinalized && !isDeadlinePassed(status)) return null;
    const newestTimestamp = history.reduce((max, entry) => {
      const timestamp = Number(entry.timestamp);
      return Number.isFinite(timestamp) ? Math.max(max, timestamp) : max;
    }, 0);
    return {
      cid: "",
      executedAt: status?.executedAt
        ? Number(status.executedAt)
        : status?.finalizationDeadline
          ? Number(status.finalizationDeadline)
          : newestTimestamp,
      finalizationDeadline: status?.finalizationDeadline ? Number(status.finalizationDeadline) : null,
      creditMatrix: [],
    };
  }, [isDeadlinePassed]);

  const fetchProjectReceipt = useCallback(async (contract, projId, status, history) => {
    if (supportsProjectReceiptGetter && typeof contract.getProjectReceipt === "function") {
      try {
        const receipt = await contract.getProjectReceipt(projId);
        const contributors = receipt.contributors ?? receipt[1] ?? [];
        const roles = receipt.roles ?? receipt.creditRoles ?? receipt[2] ?? [];
        return {
          cid: receipt.cid ?? receipt.receiptCid ?? receipt.ipfsCid ?? receipt[0] ?? "",
          executedAt: Number(receipt.executedAt ?? receipt.timestamp ?? receipt[3] ?? 0),
          creditMatrix: contributors.map((contributor, index) => ({
            contributor,
            roles: Array.isArray(roles[index]) ? roles[index] : [roles[index]].filter(Boolean),
            contributions: 1,
          })),
        };
      } catch {
        // Older deployments do not expose getProjectReceipt yet; fall back below.
      }
    }

    return buildLocalReceipt(status, history);
  }, [buildLocalReceipt, supportsProjectReceiptGetter]);

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
      if (await contract.isProjectAdmin(projId, userAddress)) return true;
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

  const findFirstBlockAtOrAfterTimestamp = useCallback(async (provider, targetTimestamp) => {
    const deployBlock = Number(process.env.NEXT_PUBLIC_DEPLOY_BLOCK || 10823551);
    let low = Math.max(deployBlock, 0);
    let high = await provider.getBlockNumber();
    let answer = high;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const block = await provider.getBlock(mid);
      if (!block) {
        low = mid + 1;
        continue;
      }

      if (Number(block.timestamp) >= targetTimestamp) {
        answer = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    return answer;
  }, []);

  const recoverTxHashesFromReceiptBlocks = useCallback(async (contract, provider, projId, missingEntries) => {
    const updates = {};
    const limitedEntries = missingEntries.slice(0, MAX_TX_HASH_BACKFILLS_PER_REFRESH);

    for (const entry of limitedEntries) {
      if (!isMountedRef.current) break;

      try {
        const targetTimestamp = Number(entry.timestamp);
        if (!Number.isFinite(targetTimestamp)) continue;

        const candidateBlock = await findFirstBlockAtOrAfterTimestamp(provider, targetTimestamp);
        const logs = await contract.queryFilter(
          contract.filters.ContributionLogged(projId, entry.contributor),
          candidateBlock,
          candidateBlock
        );
        const match = logs.find(log => (
          log.args?.cid === entry.cid
          && log.args?.timestamp?.toString() === entry.timestamp.toString()
          && log.args?.contributor?.toLowerCase() === entry.contributor.toLowerCase()
        ));

        if (match?.transactionHash) {
          updates[getContributionStorageKey(entry)] = match.transactionHash;
        }
      } catch {
        // Keep the timeline usable if a single historical lookup fails.
      }
    }

    return updates;
  }, [findFirstBlockAtOrAfterTimestamp]);

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

    const previousTxByKey = new Map(
      entriesRef.current.map(entry => [
        getContributionStorageKey(entry),
        entry.txHash,
      ])
    );
    const previousTxByContributorTimestamp = new Map(
      entriesRef.current.map(entry => [
        `${entry.contributor.toLowerCase()}-${entry.timestamp.toString()}`,
        entry.txHash,
      ])
    );
    const cachedTxHashes = readTxHashCache(projId);

    const restoreTxHash = (entry) => {
      const exactKey = getContributionStorageKey(entry);
      const fallbackKey = `${entry.contributor.toLowerCase()}-${entry.timestamp.toString()}`;
      const seedKey = getContributionSeedKey(entry.contributor, entry.cid);
      return (
        confirmedTxByContributionRef.current.get(seedKey)
        ?? confirmedTxByContributionRef.current.get(entry.cid)
        ?? cachedTxHashes[exactKey]
        ??
        previousTxByKey.get(exactKey)
        ?? previousTxByContributorTimestamp.get(fallbackKey)
        ?? ""
      );
    };

    if (!includeTxHashes || eventQueriesDisabledRef.current) {
      return storedEntries.map(entry => ({ ...entry, txHash: restoreTxHash(entry) }));
    }

    const restoredStoredEntries = storedEntries.map(entry => ({ ...entry, txHash: restoreTxHash(entry) }));
    if (storedEntries.length > 0) {
      const missingTxHash = includeTxHashes
        ? restoredStoredEntries.filter(entry => !entry.txHash)
        : [];
      if (missingTxHash.length === 0) return restoredStoredEntries;

      const recoveredTxHashes = await recoverTxHashesFromReceiptBlocks(
        contract,
        provider,
        projId,
        missingTxHash
      );
      writeTxHashCache(projId, recoveredTxHashes);

      return restoredStoredEntries.map(entry => ({
        ...entry,
        txHash: entry.txHash || recoveredTxHashes[getContributionStorageKey(entry)] || "",
      }));
    }

    try {
      const currentBlock = await provider.getBlockNumber();
      const deployBlock = Number(process.env.NEXT_PUBLIC_DEPLOY_BLOCK || 10823551);
      const fromBlock = Math.max(deployBlock, currentBlock - EVENT_LOOKBACK_BLOCKS, 0);

      const eventTopic = ethers.id("ContributionLogged(string,address,string,string,uint256)");
      const projectTopic = ethers.id(projId);
      const primaryFilter = contract.filters.ContributionLogged(projId);
      let allLogs = await fetchLogsInRanges(
        provider,
        contract,
        primaryFilter,
        [eventTopic, projectTopic],
        fromBlock,
        currentBlock
      );

      if (allLogs.length === 0 && storedEntries.length > 0) {
        const fallbackLogs = await fetchLogsInRanges(
          provider,
          contract,
          contract.filters.ContributionLogged(),
          [eventTopic],
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
  }, [
    getContributionSeedKey,
    readTxHashCache,
    recoverTxHashesFromReceiptBlocks,
    writeTxHashCache,
  ]);

  // ---------------------------------------------------------------------------
  // poll
  // ---------------------------------------------------------------------------
  const poll = useCallback(async () => {
    if (!contractRef.current || !providerRef.current || !isMountedRef.current) return false;
    if (pollInFlightRef.current) return true;

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
          const timer = setTimeout(() => {
            if (!isMountedRef.current) return;
            setNewIds(prev => {
              const s = new Set(prev);
              s.delete(e.txHash + "-" + e.timestamp);
              return s;
            });
          }, 12000);
          newIdsTimersRef.current.push(timer);
        });
        toast.success("New contribution logged on-chain.", {
          style: {
            background: "var(--paper)",
            border: "1px solid var(--rule)",
            color: "var(--accent)",
          },
        });

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
      if (isMountedRef.current) {
        applyFinalizationStatus(finStatus);
        if (finStatus?.isFinalized || isDeadlinePassed(finStatus)) {
          setIsPolling(false);
          const receipt = await fetchProjectReceipt(contractRef.current, projectId, finStatus, history);
          if (isMountedRef.current) setProjectReceipt(receipt);
        }
      }

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
      return true;
    } catch {
      return false;
    }
    finally {
      pollInFlightRef.current = false;
    }
  }, [
    applyFinalizationStatus,
    checkIsProjectAdmin,
    checkIsAuthorized,
    checkHasDisputed,
    fetchDisputeEvents,
    fetchFinalizationStatus,
    fetchProjectReceipt,
    fetchHistory,
    isDeadlinePassed,
    mergeDisputedEntries,
    projectId,
    resolveProfiles,
    updateEntries,
  ]);

  // ---------------------------------------------------------------------------
  // refreshData
  // ---------------------------------------------------------------------------
  const refreshData = useCallback(async (fallbackMessage) => {
    if (!contractRef.current || !providerRef.current) return false;
    if (refreshInFlightRef.current) return true;

    refreshInFlightRef.current = true;
    setLoading(true);
    try {
      const h = await fetchHistory(contractRef.current, providerRef.current, projectId, { includeTxHashes: false });
      if (!h) return false;

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
      if (isMountedRef.current) {
        applyFinalizationStatus(finStatus);
        if (finStatus?.isFinalized || isDeadlinePassed(finStatus)) {
          setIsPolling(false);
          const receipt = await fetchProjectReceipt(contractRef.current, projectId, finStatus, h);
          if (isMountedRef.current) setProjectReceipt(receipt);
        }
      }

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

      // Fill in tx hashes after the stable refresh list has loaded.
      try {
        const fullHistory = await fetchHistory(contractRef.current, providerRef.current, projectId, { includeTxHashes: true });
        if (isMountedRef.current && fullHistory) {
          updateEntries(fullHistory);
          prevCountRef.current = fullHistory.length;
        }
      } catch {
        // ignore, keep the refreshed list without tx hashes
      }
      return true;
    } catch (err) {
      if (isMountedRef.current) {
        setError(getFriendlyError(err, fallbackMessage));
        setLoading(false);
      }
      return false;
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [
    applyFinalizationStatus,
    checkIsProjectAdmin,
    checkIsAuthorized,
    checkHasDisputed,
    fetchDisputeEvents,
    fetchFinalizationStatus,
    fetchProjectReceipt,
    fetchHistory,
    isDeadlinePassed,
    mergeDisputedEntries,
    projectId,
    resolveProfiles,
    updateEntries,
  ]);

  const scheduleConfirmationRefresh = useCallback(() => {
    clearConfirmationTimer();
    if (!isMountedRef.current || isPendingContributionConfirmed()) {
      pendingConfirmationRef.current = null;
      confirmationAttemptRef.current = 0;
      return;
    }

    if (confirmationAttemptRef.current >= MAX_BACKOFF_RETRIES) {
      pendingConfirmationRef.current = null;
      confirmationAttemptRef.current = 0;
      return;
    }

    const delay = Math.min(
      BACKOFF_INITIAL_MS * (2 ** confirmationAttemptRef.current),
      BACKOFF_MAX_MS
    );
    confirmationAttemptRef.current += 1;

    confirmationTimerRef.current = setTimeout(async () => {
      if (!isMountedRef.current) return;
      await refreshData("Refresh failed.");
      scheduleConfirmationRefresh();
    }, delay);
  }, [clearConfirmationTimer, isPendingContributionConfirmed, refreshData]);

  const scheduleActionPoll = useCallback(() => {
    clearActionTimer();
    actionTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) poll();
    }, 1000);
  }, [clearActionTimer, poll]);

  // ---------------------------------------------------------------------------
  // Initialisation effect
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

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
    clearTimeout(pollTimerRef.current);
    clearConfirmationTimer();
    clearActionTimer();
    clearNewIdsTimers();
    pendingConfirmationRef.current = null;
    confirmationAttemptRef.current = 0;

    const init = async () => {
      try {
        const provider = getProvider();
        providerRef.current = provider;

        const contract = new ethers.Contract(contractAddress, JSON.parse(abiString), provider);
        contractRef.current = contract;
        const supportsAuthorized = await checkSupportsAuthorizedDispute(provider, contractAddress);
        setSupportsAuthorizedDispute(supportsAuthorized);

        const history = await fetchHistory(contract, provider, projectId, { includeTxHashes: false });
        if (!isMountedRef.current) return;

        prevCountRef.current = history.length;
        updateEntries(history);
        setLastRefreshed(new Date());
        setLoading(false);

        // Fill tx hashes once the base history is rendered.
        try {
          const fullHistory = await fetchHistory(contract, provider, projectId, { includeTxHashes: true });
          if (!isMountedRef.current) return;
          updateEntries(fullHistory);
          prevCountRef.current = fullHistory.length;
        } catch {
          // ignore
        }

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
          applyFinalizationStatus(finStatus.value);
          if (finStatus.value?.isFinalized || isDeadlinePassed(finStatus.value)) {
            setIsPolling(false);
            const receipt = await fetchProjectReceipt(contract, projectId, finStatus.value, history);
            if (!isMountedRef.current) return;
            setProjectReceipt(receipt);
          }
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

        if (isMountedRef.current && !finStatus.value?.isFinalized && !isDeadlinePassed(finStatus.value)) {
          setIsPolling(true);
        }

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
      clearTimeout(pollTimerRef.current);
      clearConfirmationTimer();
      clearActionTimer();
      clearNewIdsTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractAddress, abiString, projectId]);

  useEffect(() => {
    if (!isPolling) return;
    let active = true;
    let failedAttempts = 0;

    const schedule = (delay) => {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = setTimeout(async () => {
        if (!active || !isMountedRef.current) return;
        const ok = await poll();
        if (!active || !isMountedRef.current) return;

        if (ok) {
          failedAttempts = 0;
          schedule(POLL_INTERVAL);
          return;
        }

        failedAttempts += 1;
        if (failedAttempts >= MAX_BACKOFF_RETRIES) {
          setIsPolling(false);
          return;
        }

        schedule(Math.min(BACKOFF_INITIAL_MS * (2 ** (failedAttempts - 1)), BACKOFF_MAX_MS));
      }, delay);
    };

    schedule(POLL_INTERVAL);
    return () => {
      active = false;
      clearTimeout(pollTimerRef.current);
    };
  }, [isPolling, poll]);

  useEffect(() => {
    if (!refreshKey || refreshKey === 0) return;
    if (!contractRef.current || !providerRef.current) return;
    if (confirmedContribution) {
      seedConfirmedContribution(confirmedContribution);
      pendingConfirmationRef.current = confirmedContribution;
      confirmationAttemptRef.current = 0;
      clearCachedProfile(confirmedContribution.contributor);
    }

    refreshData("Refresh failed.").then(() => {
      if (isMountedRef.current && confirmedContribution) {
        scheduleConfirmationRefresh();
      }
    });

    return () => clearConfirmationTimer();
  }, [
    clearCachedProfile,
    clearConfirmationTimer,
    confirmedContribution,
    refreshKey,
    refreshData,
    scheduleConfirmationRefresh,
    seedConfirmedContribution,
  ]);

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
      scheduleActionPoll();
    } catch (err) {
      toast.error(getFriendlyError(err, "Failed to halt finalization."));
    } finally {
      setLoading(false);
    }
  }, [getWalletContract, projectId, scheduleActionPoll]);

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
      scheduleActionPoll();
    } catch (err) {
      toast.error(getFriendlyError(err, "Failed to initiate finalization."));
    } finally {
      setLoading(false);
    }
  }, [finalizationDays, initiateProjectFinalization, scheduleActionPoll, supportsEditableFinalizationWindow]);

  const uploadReceiptSnapshot = useCallback(async () => {
    const snapshot = {
      projectId,
      generatedAt: new Date().toISOString(),
      contributors: entriesRef.current.map(entry => ({
        contributor: entry.contributor,
        cid: entry.cid,
        creditRole: entry.role,
        timestamp: entry.timestamp.toString(),
      })),
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
    const file = new File([blob], `${projectId}-sealed-receipt.json`, { type: "application/json" });
    const fd = new FormData();
    fd.append("file", file);
    fd.append("label", `Proof-of-Priority Receipt - ${projectId}`);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message ?? `Receipt upload failed (HTTP ${res.status})`);
    }
    const { cid } = await res.json();
    return cid;
  }, [projectId]);

  const handleExecuteFinalization = useCallback(async () => {
    try {
      setLoading(true);
      const contract = await getWalletContract();
      let receiptCid = "";
      let tx;
      if (executeFinalizationInputs > 1) {
        receiptCid = await uploadReceiptSnapshot();
        tx = await contract.executeFinalization(projectId, receiptCid);
      } else {
        tx = await contract.executeFinalization(projectId);
      }
      await tx.wait();
      toast.success("Project sealed. The ledger is now immutable.");
      const finStatus = await fetchFinalizationStatus(contract, projectId);
      if (isMountedRef.current) {
        applyFinalizationStatus(finStatus);
        setIsPolling(false);
        const receipt = await fetchProjectReceipt(contract, projectId, finStatus, entriesRef.current);
        setProjectReceipt(receiptCid ? { ...receipt, cid: receiptCid } : receipt);
      }
    } catch (err) {
      toast.error(getFriendlyError(err, "Failed to execute finalization."));
    } finally {
      setLoading(false);
    }
  }, [
    applyFinalizationStatus,
    executeFinalizationInputs,
    fetchFinalizationStatus,
    fetchProjectReceipt,
    getWalletContract,
    projectId,
    uploadReceiptSnapshot,
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
      scheduleActionPoll();
      return true;
    } catch (err) {
      toast.error(getFriendlyError(err, "Failed to flag contribution."));
      return false;
    } finally {
      setFlaggingDisputeKey(null);
    }
  }, [getContributionHash, getWalletContract, mergeDisputedEntries, projectId, scheduleActionPoll, supportsAuthorizedDispute]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", minWidth: 0 }}>
      <style>{`
        @keyframes slideIn { from { opacity: 0; transform: translateY(-10px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
      `}</style>

      <FinalizationBanner
        finalizationStatus={finalizationStatus}
        deadlinePassed={isDeadlinePassed(finalizationStatus)}
        loading={loading}
        onHalt={handleHaltFinalization}
      />

      {isProjectSealedOrLocked && (
        <ProofOfPriorityReceipt
          projectId={projectId}
          receipt={projectReceipt}
          entries={entries}
          profileCache={profileCache}
        />
      )}

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
            deadlinePassed={isDeadlinePassed(finalizationStatus)}
            finalizationDays={finalizationDays}
            supportsEditableFinalizationWindow={supportsEditableFinalizationWindow}
            lastRefreshed={lastRefreshed}
            onRefresh={handleRefresh}
            onFinalizationDaysChange={setFinalizationDays}
            onInitiateFinalization={handleInitiateFinalization}
            onExecuteFinalization={handleExecuteFinalization}
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
              <span>✕</span>
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
                  && !isProjectSealedOrLocked
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
