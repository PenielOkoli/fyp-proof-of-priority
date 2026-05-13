export default function TimelineSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {[...Array(3)].map((_, i) => (
        <div key={i} style={{ display: "flex", gap: "12px" }}>
          <div style={{
            width: "26px",
            height: "26px",
            borderRadius: "50%",
            background: "var(--rule-light)",
            flexShrink: 0,
            animation: "pulse 1.5s infinite",
          }} />
          <div style={{
            flex: 1,
            height: "120px",
            borderRadius: "8px",
            background: "var(--paper-2)",
            border: "1px solid var(--rule-light)",
            animation: "pulse 1.5s infinite",
          }} />
        </div>
      ))}
    </div>
  );
}
