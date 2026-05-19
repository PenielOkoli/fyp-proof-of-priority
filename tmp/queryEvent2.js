const { readFileSync } = require('fs');
const { ethers } = require('ethers');
const abi = JSON.parse(readFileSync('contracts/AcademicLedger.json', 'utf8')).abi;
const provider = new ethers.JsonRpcProvider('https://eth-sepolia.g.alchemy.com/v2/9FoL3DYli9wQAHBvIJWyI');
const address = '0x1E29163A91Ae662408Da4705Bf69D5A91FF6f7a0';
const contract = new ethers.Contract(address, abi, provider);
const EVENT_QUERY_CHUNK_SIZE = 100;
const MIN_EVENT_QUERY_CHUNK_SIZE = 10;

async function fetchLogsInRanges(contract, filter, fromBlock, toBlock) {
  async function queryRange(start, end, chunkSize) {
    if (start > end) return [];
    try {
      console.log('queryRange', start, end, chunkSize);
      return await contract.queryFilter(filter, start, end);
    } catch (err) {
      console.error('failed range', start, end, chunkSize, err.error?.message || err.message);
      if (chunkSize <= MIN_EVENT_QUERY_CHUNK_SIZE) throw err;
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
    allLogs = allLogs.concat(logs);
  }
  return allLogs;
}

(async ()=>{
  try {
    const current = await provider.getBlockNumber();
    const filter = contract.filters.ContributionLogged('qwerty256');
    const logs = await fetchLogsInRanges(contract, filter, 10874009, current);
    console.log('total logs', logs.length);
    logs.forEach((log,i)=>console.log(i, log.transactionHash, log.args.cid, log.args.timestamp.toString()));
  } catch (e) {
    console.error('ERR', e);
  }
})();
