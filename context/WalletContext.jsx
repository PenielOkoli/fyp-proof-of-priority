"use client";
import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { getFriendlyError } from "@/utils/errorFormatter";

const SEPOLIA_CHAIN_ID = "0xaa36a7";
const WalletContext    = createContext(null);

export function WalletProvider({ children, contractAddress, contractABI }) {
  const [address,         setAddress]         = useState(null);
  const [isConnected,     setIsConnected]     = useState(false);
  const [isSepolia,       setIsSepolia]       = useState(false);
  const [isConnecting,    setIsConnecting]    = useState(false);
  const [error,           setError]           = useState("");
  const [profile,         setProfile]         = useState(null);
  const [needsProfile,    setNeedsProfile]    = useState(false);
  const [checkingProfile, setCheckingProfile] = useState(false);

  const checkNetwork = useCallback(async () => {
    if (!window.ethereum) return false;
    const chainId = await window.ethereum.request({ method: "eth_chainId" });
    const ok = chainId === SEPOLIA_CHAIN_ID;
    setIsSepolia(ok);
    return ok;
  }, []);

  const fetchProfile = useCallback(async (addr) => {
    if (!contractAddress || !contractABI || !addr) return;
    setCheckingProfile(true);
    try {
      const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_RPC_URL);
      const contract = new ethers.Contract(contractAddress, contractABI, provider);
      const exists   = await contract.hasProfile(addr);
      if (exists) {
        const p = await contract.getProfile(addr);
        setProfile({ name: p.name, orcid: p.orcid });
        setNeedsProfile(false);
      } else {
        setProfile(null);
        setNeedsProfile(true);
      }
    } catch (err) {
      console.error("Profile fetch failed:", err);
      setNeedsProfile(false);
    } finally {
      setCheckingProfile(false);
    }
  }, [contractAddress, contractABI]);

  const connect = useCallback(async () => {
    setError("");

    // ── No injected provider detected ────────────────────────────────────────
    if (!window.ethereum) {
      const ua = navigator.userAgent || "";
      const isMobile = /android/i.test(ua) || /iphone|ipad|ipod/i.test(ua);

      if (isMobile) {
        // Redirect into MetaMask's in-app browser so window.ethereum becomes
        // available when the user returns to the page.
        window.location.href =
          "https://metamask.app.link/dapp/dlt-research-project.vercel.app";
        return;
      }

      // Desktop with no extension installed
      setError("MetaMask is not installed. Please install it from metamask.io.");
      return;
    }

    // ── Standard MetaMask extension flow ────────────────────────────────────
    setIsConnecting(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const addr   = await signer.getAddress();
      setAddress(addr);
      setIsConnected(true);
      const onSepolia = await checkNetwork();
      if (onSepolia) await fetchProfile(addr);
    } catch (err) {
      setError(
        err?.code === 4001
          ? "Connection rejected."
          : err?.message ?? "Failed to connect."
      );
    } finally {
      setIsConnecting(false);
    }
  }, [checkNetwork, fetchProfile]);

  const disconnect = useCallback(() => {
    setAddress(null); setIsConnected(false); setIsSepolia(false);
    setProfile(null); setNeedsProfile(false); setError("");
  }, []);

  const switchToSepolia = useCallback(async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: SEPOLIA_CHAIN_ID }] });
      setIsSepolia(true);
      if (address) await fetchProfile(address);
    } catch {
      setError("Could not switch network. Please switch to Sepolia in MetaMask.");
    }
  }, [address, fetchProfile]);

  const onProfileRegistered = useCallback((name, orcid) => {
    setProfile({ name, orcid });
    setNeedsProfile(false);
  }, []);

  useEffect(() => {
    if (!window.ethereum) return;
    const onAccountsChanged = (accounts) => {
      if (accounts.length === 0) disconnect();
      else { setAddress(accounts[0]); setProfile(null); fetchProfile(accounts[0]); }
    };
    const onChainChanged = async () => { await checkNetwork(); if (address) await fetchProfile(address); };
    window.ethereum.on("accountsChanged", onAccountsChanged);
    window.ethereum.on("chainChanged", onChainChanged);
    return () => {
      window.ethereum.removeListener("accountsChanged", onAccountsChanged);
      window.ethereum.removeListener("chainChanged", onChainChanged);
    };
  }, [disconnect, checkNetwork, fetchProfile, address]);

  useEffect(() => {
    if (!window.ethereum) return;
    window.ethereum.request({ method: "eth_accounts" }).then(async (accounts) => {
      if (accounts.length > 0) {
        setAddress(accounts[0]); setIsConnected(true);
        const onSepolia = await checkNetwork();
        if (onSepolia) await fetchProfile(accounts[0]);
      }
    });
  }, [checkNetwork, fetchProfile]);

  return (
    <WalletContext.Provider value={{
      address, isConnected, isSepolia, isConnecting, error,
      connect, disconnect, switchToSepolia,
      profile, needsProfile, checkingProfile, onProfileRegistered,
    }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
