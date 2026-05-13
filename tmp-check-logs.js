const { ethers } = require('ethers');
const rpcUrl = 'https://eth-sepolia.g.alchemy.com/v2/9FoL3DYli9wQAHBvIJWyI';
const contractAddress = '0xD2f4B46a080FaD9269AA8749590c433d84F86bB0';
const abi = [{"anonymous":false,"inputs":[{"indexed":true,"internalType":"string","name":"projectId","type":"string"},{"indexed":true,"internalType":"address","name":"contributor","type":"address"},{"indexed":false,"internalType":"string","name":"cid","type":"string"},{"indexed":false,"internalType":"string","name":"creditRole","type":"string"},{"indexed":false,"internalType":"uint256","name":"timestamp","type":"uint256"}],"name":"ContributionLogged","type":"event"}];
(async () => {
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const contract = new ethers.Contract(contractAddress, abi, provider);
    const currentBlock = await provider.getBlockNumber();
    const fromBlock = 10845852;
    console.log('currentBlock', currentBlock, 'fromBlock', fromBlock);
    const genericFilter = contract.filters.ContributionLogged();
    const genericLogs = await contract.queryFilter(genericFilter, fromBlock, Math.min(fromBlock+5000, currentBlock));
    console.log('generic logs chunk length', genericLogs.length);
    if (genericLogs.length > 0) {
      console.log('first generic log args:', genericLogs[0].args);
    }
  } catch (err) {
    console.error('ERROR', err);
  }
})();
