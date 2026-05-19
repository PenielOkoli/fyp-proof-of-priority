const { readFileSync } = require('fs');
const { ethers } = require('ethers');
const abi = JSON.parse(readFileSync('contracts/AcademicLedger.json', 'utf8')).abi;
const provider = new ethers.JsonRpcProvider('https://eth-sepolia.g.alchemy.com/v2/9FoL3DYli9wQAHBvIJWyI');
const address = '0x1E29163A91Ae662408Da4705Bf69D5A91FF6f7a0';
const iface = new ethers.Interface(abi);
const eventTopic = ethers.id('ContributionLogged(string,address,string,string,uint256)');
(async ()=>{
  try {
    const current = await provider.getBlockNumber();
    const from = 10874009;
    let total = 0;
    for (let start = from; start <= current; start += 10) {
      const end = Math.min(start + 9, current);
      try {
        const logs = await provider.getLogs({ address, fromBlock: start, toBlock: end, topics: [eventTopic] });
        if (logs.length > 0) {
          console.log('chunk', start, end, logs.length);
          logs.forEach((log) => {
            const parsed = iface.parseLog(log);
            const args = parsed.args;
            console.log('  tx', log.transactionHash, 'projectId', args.projectId, 'contributor', args.contributor, 'cid', args.cid, 'timestamp', args.timestamp.toString());
          });
        }
        total += logs.length;
      } catch (e) {
        console.error('chunk err', start, end, e.message);
      }
    }
    console.log('total logs', total);
  } catch (e) {
    console.error(e);
  }
})();
