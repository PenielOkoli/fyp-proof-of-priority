const { readFileSync } = require('fs');
const { ethers } = require('ethers');
const abi = JSON.parse(readFileSync('contracts/AcademicLedger.json', 'utf8')).abi;
const provider = new ethers.JsonRpcProvider('https://eth-sepolia.g.alchemy.com/v2/9FoL3DYli9wQAHBvIJWyI');
const address = '0x1E29163A91Ae662408Da4705Bf69D5A91FF6f7a0';
const contract = new ethers.Contract(address, abi, provider);
(async ()=>{
  try {
    const projId = 'qwerty256';
    const filter = contract.filters.ContributionLogged(projId);
    const current = await provider.getBlockNumber();
    console.log('filter', filter);
    const logs = await contract.queryFilter(filter, 10874009, 10874180);
    console.log('logs length', logs.length);
    logs.forEach((log,i)=>{
      console.log(i, log.transactionHash, log.args.projectId, log.args.contributor, log.args.cid, log.args.timestamp?.toString());
    });
  } catch (e) {
    console.error(e);
  }
})();
