const { readFileSync } = require('fs');
const { ethers } = require('ethers');
const abi = JSON.parse(readFileSync('contracts/AcademicLedger.json', 'utf8')).abi;
const provider = new ethers.JsonRpcProvider('https://eth-sepolia.g.alchemy.com/v2/9FoL3DYli9wQAHBvIJWyI');
const address = '0x1E29163A91Ae662408Da4705Bf69D5A91FF6f7a0';
const contract = new ethers.Contract(address, abi, provider);
const eventTopic = ethers.id('ContributionLogged(string,address,string,string,uint256)');
const projectId = 'qwerty256';
(async ()=>{
  const current = await provider.getBlockNumber();
  const chunks = [];
  const from = 10874009;
  for (let start = from; start <= current; start += 10) {
    const end = Math.min(start+9, current);
    chunks.push([start,end]);
  }
  let logs = [];
  for (const [start,end] of chunks) {
    try {
      const chunkLogs = await provider.getLogs({ address, fromBlock: start, toBlock: end, topics: [eventTopic] });
      if (chunkLogs.length) logs = logs.concat(chunkLogs);
    } catch (e) {
      console.error('err', start, end, e.message); break;
    }
  }
  console.log('total logs', logs.length);
  const matching = logs.filter(log => log.topics[1] === ethers.id(projectId));
  console.log('matching topic logs', matching.length);
})();
