import { ethers } from "ethers";

export function truncate(value) {
  return value ? `${value.slice(0, 6)}...${value.slice(-4)}` : "-";
}

export function formatCountdown(deadline) {
  if (!deadline) return "N/A";

  const now = Math.floor(Date.now() / 1000);
  const remaining = Number(deadline) - now;
  if (remaining <= 0) return "Deadline passed";

  const days = Math.floor(remaining / 86400);
  const hours = Math.floor((remaining % 86400) / 3600);
  const mins = Math.floor((remaining % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function getContributionHash(projectId, contributor, timestamp) {
  return ethers.keccak256(
    ethers.solidityPacked(["string", "address", "uint256"], [projectId, contributor, timestamp])
  );
}
