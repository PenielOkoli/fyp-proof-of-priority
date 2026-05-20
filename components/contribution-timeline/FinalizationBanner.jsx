import { formatCountdown } from "./utils";

export default function FinalizationBanner({
  finalizationStatus,
  deadlinePassed,
  loading,
  onHalt,
}) {
  if (!finalizationStatus?.isFinalizationActive || finalizationStatus?.isFinalized) {
    return null;
  }
  if (deadlinePassed) {
    return null;
  }

  return (
    <div style={{
      background: "#FFF8E6",
      border: "1px solid #E8B84A",
      borderRadius: "8px",
      padding: "16px 20px",
      display: "flex",
      alignItems: "center",
      gap: "16px",
      boxShadow: "0 2px 8px rgba(160, 107, 16, 0.08)",
    }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#D97706", flexShrink: 0 }}>
        <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
      </svg>
      <div style={{ flex: 1 }}>
        <p style={{ fontFamily: "var(--font-geist-mono)", fontSize: "12px", fontWeight: "600", color: "#92400E", margin: "0 0 4px 0" }}>
          Project Finalization in Progress
        </p>
        <p style={{ fontFamily: "var(--font-geist-mono)", fontSize: "11px", color: "#78350F", margin: 0 }}>
          Deadline: {formatCountdown(finalizationStatus.finalizationDeadline)} - Any authorized contributor can halt this countdown
        </p>
      </div>
      <button
        onClick={onHalt}
        disabled={loading}
        style={{
          fontFamily: "var(--font-geist-mono)",
          fontSize: "10px",
          fontWeight: "600",
          background: "#A06B10",
          color: "#fff",
          border: "none",
          padding: "9px 14px",
          borderRadius: "4px",
          cursor: loading ? "not-allowed" : "pointer",
          flexShrink: 0,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          transition: "all 0.2s",
          opacity: loading ? 0.65 : 1,
        }}
        onMouseOver={e => !loading && (e.target.style.background = "#805508")}
        onMouseOut={e => (e.target.style.background = "#A06B10")}
      >
        HALT
      </button>
    </div>
  );
}
