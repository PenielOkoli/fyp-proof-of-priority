export default function EmptyLedgerState() {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      textAlign: "center",
      padding: "48px 24px",
      background: "var(--paper-2, #F9FAFB)",
      borderRadius: "8px",
      border: "2px dashed #E5E7EB",
      marginTop: "16px",
    }}>
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: "16px" }}>
        <path d="M4 22h14a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
        <path d="M2 15h10"></path>
        <path d="M2 18h10"></path>
        <path d="M2 21h10"></path>
      </svg>
      <h3 style={{ fontFamily: "var(--font-lora)", fontSize: "1.1rem", fontWeight: "600", color: "#374151", margin: "0 0 8px 0" }}>
        No Priority Claims Found
      </h3>
      <p style={{ fontFamily: "var(--font-geist-mono)", fontSize: "12px", color: "#6B7280", maxWidth: "400px", lineHeight: "1.6", margin: 0 }}>
        This project ledger is currently empty. Upload a research artifact and sign a transaction to establish your cryptographic proof-of-priority.
      </p>
    </div>
  );
}
