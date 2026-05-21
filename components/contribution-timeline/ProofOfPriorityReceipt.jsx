"use client";

import { GATEWAY } from "./constants";
import { truncate } from "./utils";

function formatUtcPlusOne(timestamp) {
  if (!timestamp) return "Unavailable";
  const date = new Date(Number(timestamp) * 1000 + 60 * 60 * 1000);
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC",
    hour12: false,
  }) + " UTC+1";
}

function buildCreditMatrix(entries, profileCache) {
  const byContributor = new Map();

  entries.forEach((entry) => {
    const key = entry.contributor.toLowerCase();
    const existing = byContributor.get(key) ?? {
      contributor: entry.contributor,
      profile: profileCache[entry.contributor] ?? null,
      roles: new Set(),
      contributions: 0,
    };
    existing.roles.add(entry.role);
    existing.contributions += 1;
    byContributor.set(key, existing);
  });

  return [...byContributor.values()].map((row) => ({
    ...row,
    roles: [...row.roles].sort(),
  }));
}

export default function ProofOfPriorityReceipt({
  projectId,
  receipt,
  entries,
  profileCache,
}) {
  const matrix = Array.isArray(receipt?.creditMatrix)
    ? receipt.creditMatrix
    : buildCreditMatrix(entries, profileCache);
  const receiptCid = receipt?.cid || "";
  const timestamp = receipt?.executedAt || receipt?.timestamp || receipt?.finalizationDeadline || null;

  return (
    <section style={{
      border: "1px solid #86EFAC",
      borderRadius: "8px",
      overflow: "hidden",
      background: "#F0FDF4",
      marginBottom: "20px",
    }}>
      <div style={{ height: "3px", background: "#15803D" }} />
      <div style={{ padding: "22px" }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "16px",
          marginBottom: "18px",
        }}>
          <div>
            <span style={{
              display: "inline-flex",
              fontFamily: "var(--font-geist-mono)",
              fontSize: "10px",
              fontWeight: 800,
              letterSpacing: "0.16em",
              color: "#fff",
              background: "#15803D",
              borderRadius: "4px",
              padding: "5px 9px",
              marginBottom: "10px",
            }}>
              PROJECT SEALED
            </span>
            <h2 style={{
              fontFamily: "var(--font-lora)",
              fontSize: "1.35rem",
              fontWeight: 700,
              color: "#14532D",
              margin: 0,
            }}>
              Proof-of-Priority Receipt
            </h2>
            <p style={{
              fontFamily: "var(--font-geist-mono)",
              fontSize: "11px",
              color: "#166534",
              marginTop: "5px",
            }}>
              Project: <strong>{projectId}</strong>
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{
              fontFamily: "var(--font-geist-mono)",
              fontSize: "9px",
              color: "#166534",
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              marginBottom: "5px",
            }}>
              Finalization Timestamp
            </p>
            <p style={{
              fontFamily: "var(--font-geist-mono)",
              fontSize: "12px",
              color: "#14532D",
              fontWeight: 700,
              margin: 0,
            }}>
              {formatUtcPlusOne(timestamp)}
            </p>
          </div>
        </div>

        <div style={{
          background: "#fff",
          border: "1px solid #BBF7D0",
          borderRadius: "6px",
          padding: "12px 14px",
          marginBottom: "16px",
        }}>
          <p style={{
            fontFamily: "var(--font-geist-mono)",
            fontSize: "9px",
            color: "#166534",
            textTransform: "uppercase",
            letterSpacing: "0.14em",
            marginBottom: "5px",
          }}>
            Sealed Receipt IPFS CID
          </p>
          {receiptCid ? (
            <a href={`${GATEWAY}/${receiptCid}`} target="_blank" rel="noreferrer" style={{
              fontFamily: "var(--font-geist-mono)",
              fontSize: "12px",
              color: "#15803D",
              wordBreak: "break-all",
              textDecoration: "none",
              fontWeight: 700,
            }}>
              {receiptCid}
            </a>
          ) : (
            <p style={{
              fontFamily: "var(--font-geist-mono)",
              fontSize: "12px",
              color: "#166534",
              margin: 0,
            }}>
              Not exposed by this deployed contract version.
            </p>
          )}
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff", border: "1px solid #BBF7D0" }}>
            <thead>
              <tr>
                {["Contributor", "Registered Identity", "CRediT Roles", "Records"].map((label) => (
                  <th key={label} style={{
                    textAlign: "left",
                    fontFamily: "var(--font-geist-mono)",
                    fontSize: "9px",
                    color: "#166534",
                    textTransform: "uppercase",
                    letterSpacing: "0.14em",
                    padding: "10px 12px",
                    borderBottom: "1px solid #BBF7D0",
                  }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.map((row) => (
                <tr key={row.contributor}>
                  <td style={{ padding: "11px 12px", borderBottom: "1px solid #DCFCE7", fontFamily: "var(--font-geist-mono)", fontSize: "11px", color: "#14532D" }}>
                    {truncate(row.contributor)}
                  </td>
                  <td style={{ padding: "11px 12px", borderBottom: "1px solid #DCFCE7", fontSize: "12px", color: "#14532D", fontWeight: 600 }}>
                    {row.profile?.name ?? row.name ?? profileCache[row.contributor]?.name ?? "Unregistered"}
                  </td>
                  <td style={{ padding: "11px 12px", borderBottom: "1px solid #DCFCE7", fontFamily: "var(--font-geist-mono)", fontSize: "11px", color: "#14532D" }}>
                    {(row.roles ?? [row.role]).filter(Boolean).join(", ")}
                  </td>
                  <td style={{ padding: "11px 12px", borderBottom: "1px solid #DCFCE7", fontFamily: "var(--font-geist-mono)", fontSize: "11px", color: "#14532D" }}>
                    {row.contributions ?? 1}
                  </td>
                </tr>
              ))}
              {matrix.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: "14px 12px", fontFamily: "var(--font-geist-mono)", fontSize: "11px", color: "#166534" }}>
                    No CRediT records were present at sealing time.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
