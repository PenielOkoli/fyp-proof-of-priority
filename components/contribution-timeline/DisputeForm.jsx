"use client";

export default function DisputeForm({
  entry,
  reason,
  isFlagging,
  onChangeReason,
  onCancel,
  onSubmit,
}) {
  return (
    <div style={{
      background: "#FFFBF5",
      border: "1px solid #E8C7A6",
      borderRadius: "6px",
      padding: "12px",
      margin: "-4px 0 18px 0",
    }}>
      <label htmlFor={`dispute-reason-${entry.txHash}`} style={{
        display: "block",
        fontFamily: "var(--font-geist-mono)",
        fontSize: "9px",
        color: "#8A4B1A",
        textTransform: "uppercase",
        letterSpacing: "0.13em",
        marginBottom: "6px",
        fontWeight: 700,
      }}>
        Dispute Reason
      </label>
      <textarea
        id={`dispute-reason-${entry.txHash}`}
        value={reason}
        onChange={e => onChangeReason(e.target.value)}
        maxLength={512}
        rows={3}
        placeholder="Briefly explain why this contribution is disputed"
        disabled={isFlagging}
        style={{
          width: "100%",
          resize: "vertical",
          border: "1px solid var(--rule)",
          borderRadius: "4px",
          background: "var(--paper)",
          color: "var(--ink)",
          fontFamily: "var(--font-geist-mono)",
          fontSize: "11px",
          lineHeight: 1.5,
          padding: "9px 10px",
          boxSizing: "border-box",
        }}
      />
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "10px",
        marginTop: "8px",
      }}>
        <span style={{
          fontFamily: "var(--font-geist-mono)",
          fontSize: "9px",
          color: "var(--ink-4)",
        }}>
          {reason.length}/512
        </span>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            type="button"
            disabled={isFlagging}
            onClick={onCancel}
            style={{
              fontFamily: "var(--font-geist-mono)",
              fontSize: "10px",
              color: "var(--ink-4)",
              background: "transparent",
              border: "1px solid var(--rule)",
              borderRadius: "4px",
              padding: "7px 10px",
              cursor: isFlagging ? "not-allowed" : "pointer",
              opacity: isFlagging ? 0.6 : 1,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isFlagging || reason.trim().length === 0}
            onClick={onSubmit}
            style={{
              fontFamily: "var(--font-geist-mono)",
              fontSize: "10px",
              fontWeight: 700,
              color: "#fff",
              background: "#991B1B",
              border: "1px solid #991B1B",
              borderRadius: "4px",
              padding: "7px 10px",
              cursor: isFlagging || reason.trim().length === 0 ? "not-allowed" : "pointer",
              opacity: isFlagging || reason.trim().length === 0 ? 0.55 : 1,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            {isFlagging ? "Flagging..." : "Flag"}
          </button>
        </div>
      </div>
    </div>
  );
}
