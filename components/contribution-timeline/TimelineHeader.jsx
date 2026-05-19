"use client";

export default function TimelineHeader({
  projectId,
  loading,
  isPolling,
  isProjectAdmin,
  finalizationStatus,
  finalizationDays,
  supportsEditableFinalizationWindow,
  lastRefreshed,
  onRefresh,
  onFinalizationDaysChange,
  onInitiateFinalization,
}) {
  const isFinalized = finalizationStatus?.isFinalized;

  return (
    <div style={{
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: "12px",
      paddingBottom: "14px",
      borderBottom: "1px solid var(--rule-light)",
      marginBottom: "16px",
    }}>
      <div>
        <p style={{
          fontFamily: "var(--font-geist-mono)",
          fontSize: "10px",
          color: isFinalized ? "#15803D" : "var(--indigo)",
          textTransform: "uppercase",
          letterSpacing: "0.18em",
          marginBottom: "4px",
        }}>
          {isFinalized ? "Sealed Ledger" : "Immutable Audit Trail"}
        </p>
        <h2 style={{
          fontFamily: "var(--font-lora)",
          fontSize: "1.15rem",
          fontWeight: 600,
          color: isFinalized ? "#15803D" : "var(--ink)",
          marginBottom: "4px",
        }}>
          Contribution Timeline
        </h2>
        <p style={{
          fontFamily: "var(--font-geist-mono)",
          fontSize: "10px",
          color: isFinalized ? "#15803D" : "var(--ink-4)",
        }}>
          Project: <span style={{ color: isFinalized ? "#15803D" : "var(--ink-2)", fontWeight: 600 }}>
            {projectId}
          </span>
        </p>
      </div>

      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: "5px",
        flexShrink: 0,
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "5px",
          fontFamily: "var(--font-geist-mono)",
          fontSize: "10px",
          color: isPolling ? "var(--accent)" : "var(--ink-4)",
        }}>
          <span style={{
            display: "inline-block",
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: isPolling ? "var(--accent)" : "var(--rule)",
            animation: isPolling ? "pulse 2s infinite" : "none",
          }} />
          {isPolling ? "Polling every 30s" : loading ? "Connecting..." : "Idle"}
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            fontFamily: "var(--font-geist-mono)",
            fontSize: "10px",
            color: "var(--ink-4)",
            background: "none",
            border: "none",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.4 : 1,
          }}
        >
          <svg
            style={{
              animation: loading ? "spin 1s linear infinite" : "none",
              width: "11px",
              height: "11px",
            }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582M20 20v-5h-.581M5.635 19A9 9 0 104.582 9" />
          </svg>
          Refresh
        </button>
        {isProjectAdmin && !finalizationStatus?.isFinalizationActive && !isFinalized && (
          <div style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "10px",
            justifyContent: "flex-end",
            maxWidth: "420px",
          }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 10px",
              borderRadius: "8px",
              border: "1px solid var(--rule)",
              background: "var(--paper-2)",
            }}>
              <label htmlFor="finalization-days" style={{
                fontFamily: "var(--font-geist-mono)",
                fontSize: "9px",
                color: "var(--ink-4)",
                textTransform: "uppercase",
                letterSpacing: "0.14em",
                margin: 0,
              }}>
                Review Window
              </label>
              <input
                id="finalization-days"
                type="number"
                min="1"
                max="30"
                step="1"
                value={finalizationDays}
                disabled={loading || !supportsEditableFinalizationWindow}
                onChange={e => {
                  const next = Math.max(1, Math.min(30, Number(e.target.value) || 1));
                  onFinalizationDaysChange(next);
                }}
                title={supportsEditableFinalizationWindow ? "Set countdown length before sealing" : "Current deployed contract uses its built-in countdown"}
                style={{
                  width: "52px",
                  height: "34px",
                  borderRadius: "6px",
                  border: "1px solid var(--rule)",
                  background: supportsEditableFinalizationWindow ? "#fff" : "var(--paper)",
                  color: supportsEditableFinalizationWindow ? "var(--ink)" : "var(--ink-4)",
                  fontFamily: "var(--font-geist-mono)",
                  fontSize: "12px",
                  textAlign: "center",
                  cursor: supportsEditableFinalizationWindow ? "text" : "not-allowed",
                }}
              />
              <span style={{ fontFamily: "var(--font-geist-mono)", fontSize: "10px", color: "var(--ink-4)" }}>
                days
              </span>
            </div>
            <button
              onClick={onInitiateFinalization}
              disabled={loading}
              style={{
                fontFamily: "var(--font-geist-mono)",
                fontSize: "10px",
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                background: "var(--accent)",
                color: "#fff",
                border: "1px solid var(--accent)",
                padding: "10px 16px",
                borderRadius: "8px",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
                transition: "background 0.2s ease, transform 0.2s ease",
              }}
              title={supportsEditableFinalizationWindow ? `Start ${finalizationDays}-day finalization countdown` : "Start the contract's configured finalization countdown"}
            >
              Initiate Finalization
            </button>
          </div>
        )}
        {lastRefreshed && (
          <p style={{ fontFamily: "var(--font-geist-mono)", fontSize: "9px", color: "var(--ink-4)" }}>
            {lastRefreshed.toLocaleTimeString()}
          </p>
        )}
      </div>
    </div>
  );
}
