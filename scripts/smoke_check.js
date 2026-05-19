const path = require('path');

const fs = require('fs');

// Simple .env.local parser (avoids adding dotenv as a dependency)
function loadEnv(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    raw.split(/\r?\n/).forEach(line => {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) return;
      let [, key, val] = m;
      // strip optional surrounding quotes
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
      process.env[key] = val;
    });
  } catch (err) {
    // ignore
  }
}

loadEnv(path.resolve(__dirname, '..', '.env.local'));
const { ethers } = require('ethers');

async function main() {
  const rpc = process.env.NEXT_PUBLIC_RPC_URL;
  const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  const deployBlock = process.env.NEXT_PUBLIC_DEPLOY_BLOCK || '0';
  const projectId = process.argv[2] || process.env.SMOKE_PROJECT_ID || 'demo-project';
  const testAddress = process.argv[3] || ethers.ZeroAddress;

  if (!rpc || !contractAddress) {
    console.error('Missing NEXT_PUBLIC_RPC_URL or NEXT_PUBLIC_CONTRACT_ADDRESS in .env.local');
    process.exit(1);
  }

  const abiPath = path.resolve(__dirname, '..', '..', 'proof-of-priority-app-contracts', 'artifacts', 'contracts', 'AcademicLedger.sol', 'AcademicLedger.json');
  if (!fs.existsSync(abiPath)) {
    console.error('ABI not found at', abiPath);
    process.exit(1);
  }

  const raw = fs.readFileSync(abiPath, 'utf8');
  const json = JSON.parse(raw);
  const abi = json.abi;

  const provider = new ethers.JsonRpcProvider(rpc);
  const contract = new ethers.Contract(contractAddress, abi, provider);

  const effectiveProjectId = projectId;
  if (projectId === 'demo-project') {
    console.warn('No projectId supplied. Pass a real projectId as the first argument or set SMOKE_PROJECT_ID in .env.local');
  }

  console.log('Contract:', contractAddress);
  console.log('RPC:', rpc);
  console.log('ProjectId:', effectiveProjectId);
  console.log('Test address:', testAddress);

  try {
    const exists = await contract.doesProjectExist(effectiveProjectId);
    console.log('doesProjectExist:', exists);
  } catch (err) {
    console.warn('doesProjectExist error:', err.message || err);
  }

  try {
    const disputed = await contract.isDisputed(effectiveProjectId);
    console.log('isDisputed:', disputed);
  } catch (err) {
    console.warn('isDisputed error:', err.message || err);
  }

  try {
    if (typeof contract.hasDisputed === 'function') {
      const used = await contract.hasDisputed(effectiveProjectId, testAddress);
      console.log('hasDisputed (test):', used);
    } else {
      console.log('hasDisputed: not available on ABI');
    }
  } catch (err) {
    console.warn('hasDisputed error:', err.message || err);
  }

  try {
    const fin = await contract.getFinalizationStatus(effectiveProjectId);
    console.log('finalizationStatus:', fin);
  } catch (err) {
    console.warn('getFinalizationStatus error:', err.message || err);
  }

  try {
    const count = await contract.getContributionCount(effectiveProjectId);
    console.log('contributionCount:', count.toString());
  } catch (err) {
    console.warn('getContributionCount error:', err.message || err);
  }

  try {
    const admin = await contract.projectAdmins(effectiveProjectId);
    console.log('projectAdmin:', admin);
  } catch (err) {
    // projectAdmins is public mapping, may not be exposed as function in some ABIs
    console.warn('projectAdmins read error (mapping):', err.message || err);
  }

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
