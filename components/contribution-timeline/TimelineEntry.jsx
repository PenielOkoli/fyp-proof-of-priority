"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { DEFAULT_STYLE, DISPUTE_BADGE, GATEWAY, ROLE_STYLE } from "./constants";
import { CheckIcon, CopyIcon, DisputeIcon } from "./icons";
import { truncate } from "./utils";
import DisputeForm from "./DisputeForm";

export default function TimelineEntry({
  entry,
  isNew,
  profile,
  isDisputed,
  hasDisputeHistory = false,
  isDisputeResolved = false,
  disputeReason,
  isProjectFinalized,
  canDispute,
  isFlagging,
  onFlagDispute,
}) {
  const style = ROLE_STYLE[entry.role] ?? DEFAULT_STYLE;
  const historyTone = hasDisputeHistory
    ? {
      dot: "#DC2626",
      bg: "#FEF2F2",
      border: "#FECACA",
      ink: "#991B1B",
      accent: "#DC2626",
      badgeBg: "#FEE2E2",
      label: "DISPUTED",
    }
    : null;
  const d = new Date(Number(entry.timestamp) * 1000);
  const utcPlusOne = new Date(d.getTime() + 60 * 60 * 1000);
  const dateUTC = utcPlusOne.toLocaleString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC",
    hour12: false,
  }) + " UTC+1";

  const [isHovered, setIsHovered] = useState(false);
  const [copiedType, setCopiedType] = useState(null);
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [disputeDraft, setDisputeDraft] = useState("");

  const handleCopy = (text, type) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  const handleCancelDispute = () => {
    setShowDisputeForm(false);
    setDisputeDraft("");
  };

  const handleSubmitDispute = async () => {
    const ok = await onFlagDispute(entry, disputeDraft.trim());
    if (ok) handleCancelDispute();
  };

  return (
    <div className="timeline-entry" style={{ display: "flex", gap: "16px", marginBottom: "24px", animation: isNew ? "slideIn 0.4s ease forwards" : "none" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: "4px" }}>
        <div style={{
          width: "9px",
          height: "9px",
          borderRadius: "50%",
          background: historyTone ? historyTone.dot : style.bar,
          border: "2px solid #fff",
          boxShadow: `0 0 0 1px ${historyTone ? historyTone.dot : style.bar}`,
        }} />
        <div style={{ width: "1px", height: "100%", background: "linear-gradient(to bottom, var(--rule), transparent)", marginTop: "4px" }} />
      </div>

      <div
        className="timeline-entry-card"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          flex: 1,
          background: historyTone ? historyTone.bg : "var(--paper)",
          borderRadius: "8px",
          borderLeft: `3px solid ${historyTone ? historyTone.dot : style.bar}`,
          padding: "20px 24px",
          border: `1px solid ${historyTone ? historyTone.border : isNew ? "var(--accent)" : "var(--rule)"}`,
          transition: "all 0.2s ease-in-out",
          transform: isHovered ? "translateY(-2px)" : "translateY(0)",
          boxShadow: isHovered ? "0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -2px rgba(0,0,0,0.04)" : "0 2px 8px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)",
        }}
      >
        <div className="timeline-entry-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
          <div>
            <h3 className="timeline-date" style={{ fontFamily: "var(--font-lora)", fontSize: "1.1rem", fontWeight: "600", color: historyTone ? historyTone.ink : "var(--ink)", margin: "0 0 4px 0" }}>
              {dateUTC}
            </h3>
            <p style={{ fontFamily: "var(--font-geist-mono)", fontSize: "11px", color: historyTone ? historyTone.accent : "var(--ink-4)", margin: 0 }}>
              BLOCK TIMESTAMP: <span style={{ color: historyTone ? historyTone.ink : "var(--ink-2)", fontWeight: "500" }}>
                {Number(entry.timestamp).toString()}
              </span>
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
            {isNew && (
              <span style={{ fontFamily: "var(--font-geist-mono)", fontSize: "10px", fontWeight: "600", letterSpacing: "0.05em", background: "var(--accent-bg)", color: "var(--accent)", padding: "4px 8px", borderRadius: "4px" }}>
                JUST NOW
              </span>
            )}
            {hasDisputeHistory && (
              <span
                title={isDisputeResolved ? "Disputed contribution excluded from sealed receipt" : "Flagged as disputed"}
                style={{ fontFamily: "var(--font-geist-mono)", fontSize: "10px", fontWeight: "600", letterSpacing: "0.05em", background: historyTone.badgeBg, color: historyTone.accent, padding: "4px 8px", borderRadius: "4px", border: `1px solid ${historyTone.border}`, display: "flex", alignItems: "center", gap: "4px" }}
              >
                <DisputeIcon /> {historyTone.label}
              </span>
            )}
            {isProjectFinalized && (
              <span style={{ fontFamily: "var(--font-geist-mono)", fontSize: "10px", fontWeight: "600", letterSpacing: "0.05em", background: "#DCFCE7", color: "#15803D", padding: "4px 8px", borderRadius: "4px", border: "1px solid #86EFAC" }}>
                SEALED
              </span>
            )}
          </div>
        </div>

        <div className="timeline-entry-meta" style={{ display: "flex", gap: "32px", marginBottom: "20px", paddingBottom: "16px", borderBottom: "1px dashed var(--rule)" }}>
          <div>
            <p style={{ fontFamily: "var(--font-geist-mono)", fontSize: "9px", color: historyTone ? historyTone.ink : "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 4px 0" }}>
              Registered Identity
            </p>
            <div className="timeline-entry-identity-row" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontFamily: "var(--font-geist-mono)", fontSize: "13px", color: historyTone ? historyTone.ink : "var(--ink)", fontWeight: "500" }}>
                {profile?.name ?? "Unregistered"}
              </span>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(entry.contributor);
                  toast.success("Address copied");
                }}
                style={{ fontFamily: "var(--font-geist-mono)", fontSize: "11px", color: historyTone ? historyTone.ink : "var(--ink-4)", background: historyTone ? historyTone.badgeBg : "var(--paper-2)", border: historyTone ? `1px solid ${historyTone.border}` : "1px solid var(--rule)", padding: "2px 6px", borderRadius: "4px", cursor: "pointer" }}
              >
                {truncate(entry.contributor)}
              </button>
            </div>
          </div>
          <div>
            <p style={{ fontFamily: "var(--font-geist-mono)", fontSize: "9px", color: historyTone ? historyTone.ink : "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 4px 0" }}>
              CRediT Role
            </p>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "8px" }}>
              <span style={{ fontFamily: "var(--font-geist-mono)", fontSize: "12px", fontWeight: "500", padding: "3px 8px", borderRadius: "4px", ...(hasDisputeHistory ? DISPUTE_BADGE : style.badge) }}>
                {entry.role}
              </span>

              {hasDisputeHistory && disputeReason && (
                <div className="timeline-dispute-reason" style={{ background: "#FEF2F2", border: `1px solid ${historyTone.border}`, borderRadius: "4px", padding: "7px 9px", maxWidth: "300px" }}>
                  <p style={{ fontFamily: "var(--font-geist-mono)", fontSize: "9px", color: historyTone.ink, textTransform: "uppercase", letterSpacing: "0.12em", margin: "0 0 4px 0", fontWeight: 700 }}>
                    Dispute reason
                  </p>
                  <p style={{ fontFamily: "var(--font-geist-mono)", fontSize: "10px", color: historyTone.ink, margin: 0, lineHeight: 1.5, wordBreak: "break-word" }}>
                    {disputeReason}
                  </p>
                </div>
              )}

              {canDispute && !showDisputeForm && (
                <button
                  type="button"
                  onClick={() => setShowDisputeForm(true)}
                  style={{ fontFamily: "var(--font-geist-mono)", fontSize: "9px", fontWeight: 700, color: "#991B1B", background: "transparent", border: "none", padding: 0, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.12em" }}
                >
                  Flag Dispute
                </button>
              )}
            </div>
          </div>
        </div>

        {canDispute && !isDisputed && showDisputeForm && (
          <DisputeForm
            entry={entry}
            reason={disputeDraft}
            isFlagging={isFlagging}
            onChangeReason={setDisputeDraft}
            onCancel={handleCancelDispute}
            onSubmit={handleSubmitDispute}
          />
        )}

        <div className="timeline-entry-links" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div>
            <p style={{ fontFamily: "var(--font-geist-mono)", fontSize: "9px", color: hasDisputeHistory ? "#991B1B" : "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 4px 0" }}>
              IPFS Artifact CID
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <a href={`${GATEWAY}/${entry.cid}`} target="_blank" rel="noreferrer" style={{ fontFamily: "var(--font-geist-mono)", fontSize: "11px", color: hasDisputeHistory ? "#991B1B" : "var(--accent)", textDecoration: "none", wordBreak: "break-all" }}>
                {truncate(entry.cid)} ↗
              </a>
              <button onClick={() => handleCopy(entry.cid, "cid")} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", color: hasDisputeHistory ? "#DC2626" : "#9CA3AF", display: "flex", alignItems: "center" }} title="Copy Full CID">
                {copiedType === "cid" ? <CheckIcon /> : <CopyIcon />}
              </button>
            </div>
          </div>
          <div>
            <p style={{ fontFamily: "var(--font-geist-mono)", fontSize: "9px", color: hasDisputeHistory ? "#991B1B" : "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 4px 0" }}>
              Sepolia TX Hash
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              {entry.txHash ? (
                <>
                  <a href={`https://sepolia.etherscan.io/tx/${entry.txHash}`} target="_blank" rel="noreferrer" style={{ fontFamily: "var(--font-geist-mono)", fontSize: "11px", color: hasDisputeHistory ? "#991B1B" : "var(--ink-3)", textDecoration: "none", wordBreak: "break-all" }}>
                    {truncate(entry.txHash)} ↗
                  </a>
                  <button onClick={() => handleCopy(entry.txHash, "txHash")} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", color: hasDisputeHistory ? "#DC2626" : "#9CA3AF", display: "flex", alignItems: "center" }} title="Copy Full Hash">
                    {copiedType === "txHash" ? <CheckIcon /> : <CopyIcon />}
                  </button>
                </>
              ) : (
                <span style={{ fontFamily: "var(--font-geist-mono)", fontSize: "11px", color: "var(--ink-4)" }}>
                  unavailable
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
