const { readFileSync } = require('fs');
const { ethers } = require('ethers');
const abi = JSON.parse(readFileSync('contracts/AcademicLedger.json', 'utf8')).abi;
const provider = new ethers.JsonRpcProvider('https://eth-sepolia.g.alchemy.com/v2/9FoL3DYli9wQAHBvIJWyI');
const addressOld = '0x40133433eaA50be0ca73b9f996B8250b9f260B7B';
const addressNew = '0x1E29163A91Ae662408Da4705Bf69D5A91FF6f7a0';
const projectId = 'qwerty256';
(async ()=>{
  try {
    const contractOld = new ethers.Contract(addressOld, abi, provider);
    const contractNew = new ethers.Contract(addressNew, abi, provider);
    console.log('codeOld', await provider.getCode(addressOld).then(c => c.length));
    console.log('codeNew', await provider.getCode(addressNew).then(c => c.length));
    try {
      const result = await contractNew.isDisputed(projectId);
      console.log('new isDisputed', result);
    } catch (e) { console.error('new isDisputed err', e.message); }
    try {
      const result = await contractOld.isDisputed(projectId);
      console.log('old isDisputed', result);
    } catch (e) { console.error('old isDisputed err', e.message); }
    const current = await provider.getBlockNumber();
    console.log('currentBlock', current);
    const filterNew = contractNew.filters.ContributionLogged(projectId);
    const logsNew = await contractNew.queryFilter(filterNew, 10874009, current);
    console.log('new logs.length', logsNew.length);
    logsNew.forEach((log,i)=>{
      console.log('new', i, log.transactionHash, log.args.cid, log.args.timestamp.toString());
    });
  } catch (e) {
    console.error(e);
  }
})();
