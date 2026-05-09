"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { ethers } from "ethers";
import toast from "react-hot-toast";

const GATEWAY = process.env.NEXT_PUBLIC_PINATA_GATEWAY ?? "https://gateway.pinata.cloud/ipfs";
const POLL_INTERVAL = 10000;
const ROLE_STYLE = {
  "Conceptualization":{ bar:"#7C5CBF", badge:{ background:"#F4F0FB", color:"#4A3580", border:"1px solid #D5C8F0" } },
  "Data Curation":{ bar:"#1E7BA0", badge:{ background:"#EBF6FA", color:"#0E4F6A", border:"1px solid #B8DFF0" } },
  "Formal Analysis":{ bar:"#2563A8", badge:{ background:"#EBF1FB", color:"#153E78", border:"1px solid #B8D0F0" } },
  "Funding Acquisition":{ bar:"#A06B10", badge:{ background:"#FDF6E8", color:"#6B4208", border:"1px solid #F0D8A0" } },
  "Investigation":{ bar:"#1A8070", badge:{ background:"#EBF7F5", color:"#0E5448", border:"1px solid #A8DDD8" } },
  "Methodology":{ bar:"#1A7A90", badge:{ background:"#EBF6FA", color:"#0E4F60", border:"1px solid #A8D8E8" } },
  "Project Administration":{ bar:"#A04070", badge:{ background:"#FBF0F5", color:"#6A2048", border:"1px solid #EDB8D0" } },
  "Resources":{ bar:"#A05020", badge:{ background:"#FDF3EC", color:"#6A3010", border:"1px solid #F0C8A0" } },
  "Software":{ bar:"#2D6A4F", badge:{ background:"#EBF5EF", color:"#1B4332", border:"1px solid #A8D8BE" } },
  "Supervision":{ bar:"#6040A0", badge:{ background:"#F3F0FB", color:"#3A206A", border:"1px solid #C8B8F0" } },
  "Validation":{ bar:"#607020", badge:{ background:"#F6F8EC", color:"#3A4810", border:"1px solid #D0D8A0" } },
  "Visualization":{ bar:"#903080", badge:{ background:"#FAF0F8", color:"#601050", border:"1px solid #E8B8E0" } },
  "Writing \u2013 Original Draft":{ bar:"#9B2335", badge:{ background:"#FDF2F4", color:"#6A0F1E", border:"1px solid #F0B8C0" } },
  "Writing \u2013 Review & Editing":{ bar:"#3D4FA0", badge:{ background:"#EEF0FA", color:"#232E6A", border:"1px solid #B8C0F0" } },
};
const DEFAULT_STYLE = { bar:"#2D6A4F", badge:{ background:"#EBF5EF", color:"#1B4332", border:"1px solid #A8D8BE" } };
function truncate(addr) { return addr ? addr.slice(0,6)+"..."+addr.slice(-4) : "-"; }

function NotaryStamp({ unixSeconds, isNew }) {
  const d = new Date(Number(unixSeconds)*1000);
  const dateStr = d.toLocaleDateString("en-GB",{day:"2-digit",month:"long",year:"numeric"});
  const timeStr = d.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false});
  return (
    <div style={{border:`1px solid ${isNew?"var(--accent)":"var(--rule)"}`,borderLeft:`3px solid ${isNew?"var(--accent)":"var(--ink-4)"}`,borderRadius:"4px",padding:"10px 14px",background:isNew?"var(--accent-bg)":"var(--paper-2)",marginBottom:"10px",transition:"all 0.5s"}}>
      <div style={{display:"flex",alignItems:"center",gap:"6px",marginBottom:"5px"}}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{color:isNew?"var(--accent)":"var(--ink-4)",flexShrink:0}}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
        </svg>
        <span style={{fontFamily:"var(--font-geist-mono)",fontSize:"9px",color:isNew?"var(--accent)":"var(--ink-4)",textTransform:"uppercase",letterSpacing:"0.2em",fontWeight:700}}>Cryptographic Timestamp</span>
        {isNew && <span style={{fontSize:"8px",fontWeight:700,background:"var(--accent)",color:"#fff",padding:"1px 5px",borderRadius:"3px"}}>JUST NOW</span>}
      </div>
      <div style={{fontFamily:"var(--font-lora)",fontWeight:600,fontSize:"14px",color:"var(--ink)",marginBottom:"1px"}}>{dateStr}</div>
      <div style={{fontFamily:"var(--font-geist-mono)",fontSize:"13px",color:"var(--ink-2)",marginBottom:"5px",letterSpacing:"0.04em"}}>{timeStr} UTC</div>
      <div style={{fontFamily:"var(--font-geist-mono)",fontSize:"9px",color:"var(--ink-4)"}}>block.timestamp: {Number(unixSeconds).toString()}</div>
    </div>
  );
}

function ContributorIdentity({ address, profile }) {
  const has = profile && profile.name;
  return (
    <div style={{display:"flex",alignItems:"center",gap:"8px",padding:"8px 0",borderTop:"1px solid var(--rule-light)",borderBottom:"1px solid var(--rule-light)",marginBottom:"8px"}}>
      <div style={{width:"28px",height:"28px",borderRadius:"50%",background:has?"var(--accent-bg)":"var(--paper-3)",border:`1px solid ${has?"#A8D8BE":"var(--rule)"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
        {has ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{color:"var(--accent)"}}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{color:"var(--ink-4)"}}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
        )}
      </div>
      <div style={{minWidth:0}}>
        {has ? (
          <>
            <p style={{fontFamily:"var(--font-geist-sans)",fontSize:"13px",fontWeight:700,color:"var(--ink)",marginBottom:"2px"}}>{profile.name}</p>
            <div style={{display:"flex",alignItems:"center",gap:"6px",flexWrap:"wrap"}}>
              <span style={{fontFamily:"var(--font-geist-mono)",fontSize:"9px",color:"var(--accent)",background:"var(--accent-bg)",border:"1px solid #A8D8BE",padding:"1px 6px",borderRadius:"3px",fontWeight:600}}>ORCID {profile.orcid}</span>
              <button onClick={()=>{navigator.clipboard?.writeText(address);toast.success("Address copied");}} style={{fontFamily:"var(--font-geist-mono)",fontSize:"9px",color:"var(--ink-4)",background:"none",border:"none",cursor:"pointer",padding:0}} title={address}>{truncate(address)}</button>
            </div>
          </>
        ) : (
          <>
            <p style={{fontFamily:"var(--font-geist-mono)",fontSize:"9px",color:"var(--ink-4)",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:"2px"}}>Wallet Identity (msg.sender)</p>
            <button onClick={()=>{navigator.clipboard?.writeText(address);toast.success("Address copied");}} style={{fontFamily:"var(--font-geist-mono)",fontSize:"11px",fontWeight:600,color:"var(--ink-2)",background:"none",border:"none",cursor:"pointer",padding:0}} title={address}>{address}</button>
          </>
        )}
      </div>
    </div>
  );
}

function TimelineEntry({ entry, index, isNew, profile }) {
  const style = ROLE_STYLE[entry.role] ?? DEFAULT_STYLE;
  const truncate = (str) => str ? `${str.slice(0, 6)}...${str.slice(-4)}` : "";
  const d = new Date(Number(entry.timestamp) * 1000);
  const dateUTC = d.toLocaleString("en-GB", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    timeZone: "UTC", hour12: false
  }) + " UTC";

  return (
    <div style={{ display: "flex", gap: "16px", marginBottom: "24px",
      animation: isNew ? "slideIn 0.4s ease forwards" : "none" }}>
      
      {/* Ledger line & dot */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: "4px" }}>
        <div style={{ width: "9px", height: "9px", borderRadius: "50%",
          background: style.bar, border: "2px solid #fff",
          boxShadow: `0 0 0 1px ${style.bar}` }} />
        <div style={{ width: "1px", height: "100%",
          background: "linear-gradient(to bottom, var(--rule), transparent)", marginTop: "4px" }} />
      </div>

      {/* Card */}
      <div style={{ flex: 1, background: "var(--paper)", borderRadius: "8px",
        borderLeft: `3px solid ${style.bar}`,
        boxShadow: "0 2px 8px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)",
        padding: "20px 24px", border: `1px solid ${isNew ? "var(--accent)" : "var(--rule)"}` }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
          <div>
            <h3 style={{ fontFamily: "var(--font-lora)", fontSize: "1.1rem", fontWeight: "600",
              color: "var(--ink)", margin: "0 0 4px 0" }}>{dateUTC}</h3>
            <p style={{ fontFamily: "var(--font-geist-mono)", fontSize: "11px", color: "var(--ink-4)", margin: 0 }}>
              BLOCK TIMESTAMP: <span style={{ color: "var(--ink-2)", fontWeight: "500" }}>
                {Number(entry.timestamp).toString()}
              </span>
            </p>
          </div>
          {isNew && (
            <span style={{ fontFamily: "var(--font-geist-mono)", fontSize: "10px", fontWeight: "600",
              letterSpacing: "0.05em", background: "var(--accent-bg)", color: "var(--accent)",
              padding: "4px 8px", borderRadius: "4px" }}>JUST NOW</span>
          )}
        </div>

        {/* Identity & Role */}
        <div style={{ display: "flex", gap: "32px", marginBottom: "20px",
          paddingBottom: "16px", borderBottom: "1px dashed var(--rule)" }}>
          <div>
            <p style={{ fontFamily: "var(--font-geist-mono)", fontSize: "9px", color: "var(--ink-4)",
              textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 4px 0" }}>
              Registered Identity
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontFamily: "var(--font-geist-mono)", fontSize: "13px",
                color: "var(--ink)", fontWeight: "500" }}>
                {profile?.name ?? "Unregistered"}
              </span>
              <button onClick={() => { navigator.clipboard?.writeText(entry.contributor);
                toast.success("Address copied"); }}
                style={{ fontFamily: "var(--font-geist-mono)", fontSize: "11px",
                  color: "var(--ink-4)", background: "var(--paper-2)",
                  border: "1px solid var(--rule)", padding: "2px 6px",
                  borderRadius: "4px", cursor: "pointer" }}>
                {truncate(entry.contributor)}
              </button>
            </div>
          </div>
          <div>
            <p style={{ fontFamily: "var(--font-geist-mono)", fontSize: "9px", color: "var(--ink-4)",
              textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 4px 0" }}>
              CRediT Role
            </p>
            <span style={{ fontFamily: "var(--font-geist-mono)", fontSize: "12px",
              fontWeight: "500", padding: "3px 8px", borderRadius: "4px", ...style.badge }}>
              {entry.role}
            </span>
          </div>
        </div>

        {/* Cryptographic proofs */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div>
            <p style={{ fontFamily: "var(--font-geist-mono)", fontSize: "9px", color: "var(--ink-4)",
              textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 4px 0" }}>
              IPFS Artifact CID
            </p>
            <a href={`${GATEWAY}/${entry.cid}`} target="_blank" rel="noreferrer"
              style={{ fontFamily: "var(--font-geist-mono)", fontSize: "11px",
                color: "var(--accent)", textDecoration: "none", wordBreak: "break-all" }}>
              {entry.cid.slice(0, 20)}… ↗
            </a>
          </div>
          <div>
            <p style={{ fontFamily: "var(--font-geist-mono)", fontSize: "9px", color: "var(--ink-4)",
              textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 4px 0" }}>
              Sepolia TX Hash
            </p>
            <button onClick={() => { navigator.clipboard?.writeText(entry.txHash);
              toast.success("Tx hash copied"); }}
              style={{ fontFamily: "var(--font-geist-mono)", fontSize: "11px",
                color: "var(--ink-3)", background: "none", border: "none",
                cursor: "pointer", padding: 0, wordBreak: "break-all" }}>
              {truncate(entry.txHash)} ↗
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ContributionTimeline({ contractAddress, contractABI, projectId, readOnlyRpcUrl, refreshKey }) {
  const [entries,setEntries]=useState([]);
  const [newIds,setNewIds]=useState(new Set());
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [lastRefreshed,setLastRefreshed]=useState(null);
  const [isPolling,setIsPolling]=useState(false);
  const [profileCache,setProfileCache]=useState({});
  const contractRef=useRef(null),providerRef=useRef(null),pollTimerRef=useRef(null),prevCountRef=useRef(0);

  const getProvider=useCallback(()=>{
    if(readOnlyRpcUrl) return new ethers.JsonRpcProvider(readOnlyRpcUrl);
    if(typeof window!=="undefined"&&window.ethereum) return new ethers.BrowserProvider(window.ethereum);
    throw new Error("No provider available.");
  },[readOnlyRpcUrl]);

  const resolveProfiles=useCallback(async(addresses,contract,currentCache)=>{
    const unique=[...new Set(addresses)].filter(a=>!(a in currentCache));
    if(unique.length===0) return currentCache;
    const updates={...currentCache};
    await Promise.all(unique.map(async addr=>{
      try{ const p=await contract.getProfile(addr); updates[addr]=p.exists?{name:p.name,orcid:p.orcid}:null; }
      catch{ updates[addr]=null; }
    }));
    return updates;
  },[]);

  const fetchHistory=useCallback(async(contract,provider)=>{
    const currentBlock=await provider.getBlockNumber();
    const deployBlock=Number(process.env.NEXT_PUBLIC_DEPLOY_BLOCK??0);
    const CHUNK=9; let allLogs=[];
    const filter=contract.filters.ContributionLogged(projectId);
    for(let from=deployBlock;from<=currentBlock;from+=CHUNK){
      const to=Math.min(from+CHUNK-1,currentBlock);
      try{ const logs=await contract.queryFilter(filter,from,to); if(logs.length>0) allLogs=allLogs.concat(logs); }catch{}
    }
    return allLogs.map(log=>({contributor:log.args.contributor,cid:log.args.cid,role:log.args.creditRole,timestamp:log.args.timestamp,txHash:log.transactionHash}))
      .sort((a,b)=>Number(b.timestamp)-Number(a.timestamp));
  },[projectId]);

  const poll=useCallback(async()=>{
    if(!contractRef.current||!providerRef.current) return;
    try{
      const history=await fetchHistory(contractRef.current,providerRef.current);
      if(history.length>prevCountRef.current&&prevCountRef.current>0){
        const added=history.slice(0,history.length-prevCountRef.current);
        setNewIds(prev=>{const s=new Set(prev);added.forEach(e=>s.add(e.txHash+"-"+e.timestamp));return s;});
        added.forEach(e=>setTimeout(()=>setNewIds(prev=>{const s=new Set(prev);s.delete(e.txHash+"-"+e.timestamp);return s;}),12000));
        toast.success("New contribution logged on-chain.",{style:{background:"var(--paper)",border:"1px solid var(--rule)",color:"var(--accent)"}});
      }
      const newAddrs=history.map(e=>e.contributor);
      const uncached=[...new Set(newAddrs)].filter(a=>!(a in profileCache));
      if(uncached.length>0){ resolveProfiles(newAddrs,contractRef.current,profileCache).then(setProfileCache); }
      prevCountRef.current=history.length; setEntries(history); setLastRefreshed(new Date());
    }catch{}
  },[fetchHistory,resolveProfiles,profileCache]);

  useEffect(()=>{
    if(!contractAddress||!contractABI||!projectId) return;
    let isMounted=true;
    setEntries([]);setLoading(true);setError("");setIsPolling(false);setProfileCache({});prevCountRef.current=0;
    clearInterval(pollTimerRef.current);
    const init=async()=>{
      try{
        const provider=getProvider();providerRef.current=provider;
        const contract=new ethers.Contract(contractAddress,contractABI,provider);contractRef.current=contract;
        const history=await fetchHistory(contract,provider);
        const cache=await resolveProfiles(history.map(e=>e.contributor),contract,{});
        if(isMounted){prevCountRef.current=history.length;setEntries(history);setProfileCache(cache);setLastRefreshed(new Date());setLoading(false);setIsPolling(true);}
      }catch(err){if(isMounted){setError(err?.message??"Failed to load.");setLoading(false);}}
    };
    init();
    return()=>{isMounted=false;clearInterval(pollTimerRef.current);};
  },[contractAddress,contractABI,projectId,getProvider,fetchHistory,resolveProfiles]);

  useEffect(()=>{
    if(!isPolling) return;
    pollTimerRef.current=setInterval(poll,POLL_INTERVAL);
    return()=>clearInterval(pollTimerRef.current);
  },[isPolling,poll]);

  useEffect(()=>{
    if(!refreshKey||refreshKey===0) return;
    if(!contractRef.current||!providerRef.current) return;
    const t=setTimeout(async()=>{
      setLoading(true);
      try{
        const h=await fetchHistory(contractRef.current,providerRef.current);
        const cache=await resolveProfiles(h.map(e=>e.contributor),contractRef.current,profileCache);
        prevCountRef.current=h.length;setEntries(h);setProfileCache(cache);setLastRefreshed(new Date());
      }catch(err){setError(err?.message??"Refresh failed.");}
      finally{setLoading(false);}
    },2500);
    return()=>clearTimeout(t);
  },[refreshKey,fetchHistory,resolveProfiles,profileCache]);

  const handleRefresh=async()=>{
    if(!contractRef.current||!providerRef.current) return;
    setLoading(true);
    try{
      const h=await fetchHistory(contractRef.current,providerRef.current);
      const cache=await resolveProfiles(h.map(e=>e.contributor),contractRef.current,profileCache);
      prevCountRef.current=h.length;setEntries(h);setProfileCache(cache);setLastRefreshed(new Date());
    }catch(err){setError(err?.message??"Refresh failed.");}
    finally{setLoading(false);}
  };

  return(
    <>
      <style>{`@keyframes slideIn{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}} @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      <div style={{border:"1px solid var(--rule)",borderRadius:"8px",overflow:"hidden",background:"var(--paper)"}}>
        <div style={{height:"2px",background:"var(--indigo)"}}/>
        <div style={{padding:"22px"}}>
          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:"12px",paddingBottom:"14px",borderBottom:"1px solid var(--rule-light)",marginBottom:"16px"}}>
            <div>
              <p style={{fontFamily:"var(--font-geist-mono)",fontSize:"10px",color:"var(--indigo)",textTransform:"uppercase",letterSpacing:"0.18em",marginBottom:"4px"}}>Immutable Audit Trail</p>
              <h2 style={{fontFamily:"var(--font-lora)",fontSize:"1.15rem",fontWeight:600,color:"var(--ink)",marginBottom:"4px"}}>Contribution Timeline</h2>
              <p style={{fontFamily:"var(--font-geist-mono)",fontSize:"10px",color:"var(--ink-4)"}}>Project: <span style={{color:"var(--ink-2)",fontWeight:600}}>{projectId}</span></p>
            </div>
            <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:"5px",flexShrink:0}}>
              <div style={{display:"flex",alignItems:"center",gap:"5px",fontFamily:"var(--font-geist-mono)",fontSize:"10px",color:isPolling?"var(--accent)":"var(--ink-4)"}}>
                <span style={{display:"inline-block",width:"6px",height:"6px",borderRadius:"50%",background:isPolling?"var(--accent)":"var(--rule)",animation:isPolling?"pulse 2s infinite":"none"}}/>
                {isPolling?"Polling every 10s":loading?"Connecting...":"Idle"}
              </div>
              <button onClick={handleRefresh} disabled={loading} style={{display:"flex",alignItems:"center",gap:"4px",fontFamily:"var(--font-geist-mono)",fontSize:"10px",color:"var(--ink-4)",background:"none",border:"none",cursor:loading?"not-allowed":"pointer",opacity:loading?0.4:1}}>
                <svg style={{animation:loading?"spin 1s linear infinite":"none",width:"11px",height:"11px"}} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582M20 20v-5h-.581M5.635 19A9 9 0 104.582 9"/></svg>
                Refresh
              </button>
              {lastRefreshed&&<p style={{fontFamily:"var(--font-geist-mono)",fontSize:"9px",color:"var(--ink-4)"}}>{lastRefreshed.toLocaleTimeString()}</p>}
            </div>
          </div>
          {entries.length>0&&(
            <div style={{display:"flex",alignItems:"center",gap:"12px",marginBottom:"16px"}}>
              <span style={{background:"var(--indigo-bg)",color:"var(--indigo)",border:"1px solid #C5CAE9",fontFamily:"var(--font-geist-mono)",fontSize:"10px",fontWeight:700,padding:"2px 10px",borderRadius:"4px"}}>{entries.length} {entries.length===1?"record":"records"}</span>
              <div style={{height:"1px",flex:1,background:"var(--rule-light)"}}/>
            </div>
          )}
          {error&&<div style={{background:"var(--danger-bg)",border:"1px solid #F5C6CB",color:"var(--danger)",borderRadius:"6px",padding:"9px 12px",fontSize:"12px",marginBottom:"12px",display:"flex",gap:"8px"}}><span>x</span><span style={{lineHeight:1.5}}>{error}</span></div>}
          {loading&&entries.length===0&&(
            <div style={{display:"flex",flexDirection:"column",gap:"12px"}}>
              {[...Array(3)].map((_,i)=>(
                <div key={i} style={{display:"flex",gap:"12px"}}>
                  <div style={{width:"26px",height:"26px",borderRadius:"50%",background:"var(--rule-light)",flexShrink:0,animation:"pulse 1.5s infinite"}}/>
                  <div style={{flex:1,height:"120px",borderRadius:"8px",background:"var(--paper-2)",border:"1px solid var(--rule-light)",animation:"pulse 1.5s infinite"}}/>
                </div>
              ))}
            </div>
          )}
          {!loading&&!error&&entries.length===0&&(
            <div style={{textAlign:"center",padding:"48px 0"}}>
              <p style={{fontFamily:"var(--font-lora)",fontSize:"14px",color:"var(--ink-4)",fontStyle:"italic"}}>No contributions logged for this project yet.</p>
              <p style={{fontFamily:"var(--font-geist-mono)",fontSize:"11px",color:"var(--ink-4)",marginTop:"8px"}}>The timeline will populate after the first on-chain record.</p>
            </div>
          )}
          {entries.length>0&&(
            <div>
              {entries.map((entry,idx)=>{
                const key=entry.txHash+"-"+entry.timestamp;
                return <TimelineEntry key={key} entry={entry} index={idx} isNew={newIds.has(key)} profile={profileCache[entry.contributor]}/>;
              })}
              <p style={{textAlign:"center",fontFamily:"var(--font-geist-mono)",fontSize:"10px",color:"var(--ink-4)",borderTop:"1px solid var(--rule-light)",paddingTop:"12px"}}>All records are append-only and immutable. No scoring applied.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
