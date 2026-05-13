import { ethers } from "ethers";

export function getReadProvider() {
  if (process.env.NEXT_PUBLIC_RPC_URL) {
    return new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_RPC_URL);
  }

  if (typeof window !== "undefined" && window.ethereum) {
    return new ethers.BrowserProvider(window.ethereum);
  }

  throw new Error("Read RPC provider is not configured.");
}
