const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equals = trimmed.indexOf("=");
    if (equals === -1) continue;
    const key = trimmed.slice(0, equals);
    const value = trimmed.slice(equals + 1);
    if (!process.env[key]) process.env[key] = value;
  }
}

function getContributionStorageKey(entry) {
  return `${entry.contributor.toLowerCase()}-${entry.timestamp.toString()}-${entry.cid}`;
}

async function findFirstBlockAtOrAfterTimestamp(provider, targetTimestamp, deployBlock) {
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
}

async function main() {
  loadEnvLocal();

  const projectId = process.argv[2] || "DLT_Research2026";
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;
  const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  const deployBlock = Number(process.env.NEXT_PUBLIC_DEPLOY_BLOCK || 0);
  if (!rpcUrl || !contractAddress || !deployBlock) {
    throw new Error("Missing NEXT_PUBLIC_RPC_URL, NEXT_PUBLIC_CONTRACT_ADDRESS, or NEXT_PUBLIC_DEPLOY_BLOCK.");
  }

  const abiPath = path.join(process.cwd(), "contracts", "AcademicLedger.json");
  const abi = JSON.parse(fs.readFileSync(abiPath, "utf8")).abi;
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contract = new ethers.Contract(contractAddress, abi, provider);

  const stored = await contract.getContributions(projectId);
  const backfill = {};

  for (const item of stored) {
    const entry = {
      contributor: item.contributor,
      cid: item.cid,
      role: item.creditRole,
      timestamp: item.timestamp,
    };
    const targetTimestamp = Number(entry.timestamp);
    const blockNumber = await findFirstBlockAtOrAfterTimestamp(provider, targetTimestamp, deployBlock);
    const logs = await contract.queryFilter(
      contract.filters.ContributionLogged(projectId, entry.contributor),
      blockNumber,
      blockNumber
    );
    const match = logs.find(log => (
      log.args?.cid === entry.cid
      && log.args?.timestamp?.toString() === entry.timestamp.toString()
      && log.args?.contributor?.toLowerCase() === entry.contributor.toLowerCase()
    ));

    backfill[getContributionStorageKey(entry)] = {
      projectId,
      contributor: entry.contributor,
      cid: entry.cid,
      timestamp: entry.timestamp.toString(),
      blockNumber,
      txHash: match?.transactionHash || null,
    };
  }

  fs.mkdirSync(path.join(process.cwd(), "tmp"), { recursive: true });
  const outputPath = path.join(process.cwd(), "tmp", `contribution-txhash-backfill-${projectId}.json`);
  fs.writeFileSync(outputPath, `${JSON.stringify(backfill, null, 2)}\n`);
  console.log(`Wrote ${Object.keys(backfill).length} backfill records to ${outputPath}`);
  console.log(JSON.stringify(backfill, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
