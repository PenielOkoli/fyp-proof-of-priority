const { readFileSync } = require('fs');
const { ethers } = require('ethers');
const abi = JSON.parse(readFileSync('contracts/AcademicLedger.json', 'utf8')).abi;
const provider = new ethers.JsonRpcProvider('https://eth-sepolia.g.alchemy.com/v2/9FoL3DYli9wQAHBvIJWyI');
const address = '0x1E29163A91Ae662408Da4705Bf69D5A91FF6f7a0';
const contract = new ethers.Contract(address, abi, provider);
(async ()=>{
  try {
    const contributions = await contract.getContributions('qwerty256');
    console.log('contribution count', contributions.length);
    contributions.forEach((c,i)=>console.log(i, c.contributor, c.cid, c.creditRole, c.timestamp.toString()));
  } catch(e) { console.error(e); }
})();
