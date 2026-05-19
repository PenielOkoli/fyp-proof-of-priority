const { readFileSync } = require('fs');
const { ethers } = require('ethers');
const abi = JSON.parse(readFileSync('contracts/AcademicLedger.json', 'utf8')).abi;
const provider = new ethers.JsonRpcProvider('https://eth-sepolia.g.alchemy.com/v2/9FoL3DYli9wQAHBvIJWyI');
const address = '0x1E29163A91Ae662408Da4705Bf69D5A91FF6f7a0';
const contract = new ethers.Contract(address, abi, provider);
(async ()=>{
  try {
    const projId = 'qwerty256';
    const current = await provider.getBlockNumber();
    const filter = contract.filters.ContributionLogged(projId);
    console.log('filter keys', Object.keys(filter));
    console.log('topics', filter.topics);
    let total = 0;
    for (let start = 10874009; start <= current; start += 10) {
      const end = Math.min(start + 9, current);
      try {
        const logs = await provider.getLogs({ address, fromBlock: start, toBlock: end, topics: filter.topics });
        if (logs.length > 0) {
          console.log('chunk', start, end, logs.length);
          logs.forEach((log) => {
            const parsed = contract.interface.parseLog(log);
            console.log(' tx', log.transactionHash, 'projectId', parsed.args.projectId, 'contributor', parsed.args.contributor, 'cid', parsed.args.cid);
          });
        }
        total += logs.length;
      } catch (e) {
        console.error('err chunk', start, end, e.message);
      }
    }
    console.log('total logs', total);
  } catch (e) { console.error(e); }
})();
