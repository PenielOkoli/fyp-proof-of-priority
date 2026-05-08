"use client";
import { useWallet } from "@/context/WalletContext";

function truncate(addr) { return addr ? `${addr.slice(0,6)}...${addr.slice(-4)}` : ""; }

export default function WalletBar() {
  const { address, isConnected, isSepolia, isConnecting, checkingProfile, error, connect, disconnect, switchToSepolia, profile } = useWallet();

  return (
    <div style={{ position:"sticky", top:0, zIndex:100, background:"var(--paper)", borderBottom:"1px solid var(--rule)", padding:"10px 40px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:"12px" }}>
      <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
        <div style={{ width:"7px", height:"7px", borderRadius:"50%", background:"var(--accent)", flexShrink:0 }} />
        <span style={{ fontFamily:"var(--font-geist-mono)", fontSize:"11px", color:"var(--ink-4)", letterSpacing:"0.15em", textTransform:"uppercase" }}>DLT Proof-of-Priority</span>
      </div>

      <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
        {error && <span style={{ fontSize:"11px", color:"var(--danger)", fontFamily:"var(--font-geist-mono)" }}>{error}</span>}

        {isConnected && !isSepolia && (
          <button onClick={switchToSepolia} style={{ fontSize:"11px", padding:"4px 10px", borderRadius:"4px", border:"1px solid #F5C6CB", background:"var(--danger-bg)", color:"var(--danger)", cursor:"pointer", fontFamily:"var(--font-geist-mono)" }}>
            Switch to Sepolia
          </button>
        )}

        {isConnected && isSepolia && (
          <div style={{ display:"flex", alignItems:"center", gap:"5px", padding:"3px 9px", borderRadius:"4px", border:"1px solid #A8D8BE", background:"var(--accent-bg)" }}>
            <span style={{ width:"5px", height:"5px", borderRadius:"50%", background:"var(--accent)", display:"inline-block" }} />
            <span style={{ fontSize:"10px", color:"var(--accent)", fontFamily:"var(--font-geist-mono)" }}>Sepolia</span>
          </div>
        )}

        {isConnected ? (
          <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
            <div style={{ padding:"5px 12px", borderRadius:"4px", border:"1px solid var(--rule)", background:"var(--paper-2)", display:"flex", alignItems:"center", gap:"8px" }}>
              {checkingProfile ? (
                <span style={{ fontFamily:"var(--font-geist-mono)", fontSize:"11px", color:"var(--ink-4)" }}>Checking identity...</span>
              ) : profile ? (
                <>
                  <div style={{ width:"20px", height:"20px", borderRadius:"50%", background:"var(--accent-bg)", border:"1px solid #A8D8BE", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color:"var(--accent)" }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                    </svg>
                  </div>
                  <div>
                    <p style={{ fontFamily:"var(--font-geist-sans)", fontSize:"12px", fontWeight:700, color:"var(--ink)", lineHeight:1.1 }}>{profile.name}</p>
                    <p style={{ fontFamily:"var(--font-geist-mono)", fontSize:"9px", color:"var(--ink-4)", lineHeight:1.1 }}>ORCID {profile.orcid} &nbsp;&middot;&nbsp; {truncate(address)}</p>
                  </div>
                </>
              ) : (
                <span style={{ fontFamily:"var(--font-geist-mono)", fontSize:"12px", fontWeight:600, color:"var(--ink-2)" }}>{truncate(address)}</span>
              )}
            </div>
            <button onClick={disconnect} style={{ fontSize:"11px", padding:"4px 10px", borderRadius:"4px", border:"1px solid var(--rule)", background:"var(--paper)", color:"var(--ink-4)", cursor:"pointer", fontFamily:"var(--font-geist-mono)" }}>Disconnect</button>
          </div>
        ) : (
          <button onClick={connect} disabled={isConnecting} style={{ padding:"8px 18px", borderRadius:"6px", border:"none", background:isConnecting?"var(--paper-3)":"var(--accent)", color:isConnecting?"var(--ink-4)":"#fff", fontSize:"13px", fontWeight:600, cursor:isConnecting?"not-allowed":"pointer", letterSpacing:"0.03em" }}>
            {isConnecting ? "Connecting..." : "Connect Web3 Wallet"}
          </button>
        )}
      </div>
    </div>
  );
}
