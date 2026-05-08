"use client";
import { useState } from "react";

const VALID_RE = /^[a-zA-Z0-9_\-\.]{3,64}$/;

export default function ProjectLoader({ currentProjectId, onLoad }) {
  const [input,   setInput]   = useState(currentProjectId ?? "");
  const [touched, setTouched] = useState(false);

  const isValid = VALID_RE.test(input.trim());
  const isDirty = input.trim() !== (currentProjectId ?? "");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isValid) return;
    onLoad(input.trim());
  };

  return (
    <div style={{ background:"var(--paper)", border:"1px solid var(--rule)", borderRadius:"8px", padding:"18px 22px" }}>
      <p style={{ fontFamily:"var(--font-geist-mono)", fontSize:"10px", color:"var(--ink-4)", textTransform:"uppercase", letterSpacing:"0.18em", marginBottom:"8px" }}>
        Project Workspace
      </p>
      <form onSubmit={handleSubmit} style={{ display:"flex", gap:"10px", alignItems:"flex-start" }}>
        <div style={{ flex:1 }}>
          <input
            type="text"
            value={input}
            onChange={(e) => { setInput(e.target.value); setTouched(true); }}
            placeholder="e.g. DLT-Research-01"
            spellCheck={false}
            style={{ width:"100%", padding:"9px 14px", borderRadius:"6px", border:`1px solid ${touched && !isValid && input ? "var(--danger)" : "var(--rule)"}`, background:"var(--paper)", color:"var(--ink)", fontFamily:"var(--font-geist-mono)", fontSize:"14px", outline:"none" }}
          />
          {touched && !isValid && input && (
            <p style={{ fontSize:"11px", color:"var(--danger)", marginTop:"4px", fontFamily:"var(--font-geist-mono)" }}>
              3-64 characters. Letters, numbers, hyphens and dots only.
            </p>
          )}
        </div>
        <button type="submit" disabled={!isValid || !isDirty} style={{ padding:"9px 18px", borderRadius:"6px", border:"none", background: !isValid || !isDirty ? "var(--paper-3)" : "var(--indigo)", color: !isValid || !isDirty ? "var(--ink-4)" : "#fff", fontFamily:"var(--font-geist-mono)", fontSize:"12px", fontWeight:600, cursor: !isValid || !isDirty ? "not-allowed" : "pointer", whiteSpace:"nowrap" }}>
          Load / Create Project
        </button>
      </form>
      {currentProjectId && (
        <p style={{ fontSize:"11px", color:"var(--ink-4)", marginTop:"8px", fontFamily:"var(--font-geist-mono)" }}>
          Active: <span style={{ color:"var(--ink-2)", fontWeight:600 }}>{currentProjectId}</span>
        </p>
      )}
    </div>
  );
}
