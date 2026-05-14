export const GATEWAY = process.env.NEXT_PUBLIC_PINATA_GATEWAY ?? "https://gateway.pinata.cloud/ipfs";
export const POLL_INTERVAL = 30000;

// Use a large chunk size so we make as few RPC calls as possible.
// Alchemy and most providers support up to 10,000 blocks per request;
// using 2,000 is a safe default that still dramatically reduces the number
// of round-trips compared to the previous value of 10.
export const EVENT_QUERY_CHUNK_SIZE = 2000;
export const MIN_EVENT_QUERY_CHUNK_SIZE = 100;

export const DEFAULT_FINALIZATION_DAYS = 7;
export const SECONDS_PER_DAY = 86400;

export const ROLE_STYLE = {
  "Conceptualization": { bar: "#7C5CBF", badge: { background: "#F4F0FB", color: "#4A3580", border: "1px solid #D5C8F0" } },
  "Data Curation": { bar: "#1E7BA0", badge: { background: "#EBF6FA", color: "#0E4F6A", border: "1px solid #B8DFF0" } },
  "Formal Analysis": { bar: "#2563A8", badge: { background: "#EBF1FB", color: "#153E78", border: "1px solid #B8D0F0" } },
  "Funding Acquisition": { bar: "#A06B10", badge: { background: "#FDF6E8", color: "#6B4208", border: "1px solid #F0D8A0" } },
  "Investigation": { bar: "#1A8070", badge: { background: "#EBF7F5", color: "#0E5448", border: "1px solid #A8DDD8" } },
  "Methodology": { bar: "#1A7A90", badge: { background: "#EBF6FA", color: "#0E4F60", border: "1px solid #A8D8E8" } },
  "Project Administration": { bar: "#A04070", badge: { background: "#FBF0F5", color: "#6A2048", border: "1px solid #EDB8D0" } },
  "Resources": { bar: "#A05020", badge: { background: "#FDF3EC", color: "#6A3010", border: "1px solid #F0C8A0" } },
  "Software": { bar: "#2D6A4F", badge: { background: "#EBF5EF", color: "#1B4332", border: "1px solid #A8D8BE" } },
  "Supervision": { bar: "#6040A0", badge: { background: "#F3F0FB", color: "#3A206A", border: "1px solid #C8B8F0" } },
  "Validation": { bar: "#607020", badge: { background: "#F6F8EC", color: "#3A4810", border: "1px solid #D0D8A0" } },
  "Visualization": { bar: "#903080", badge: { background: "#FAF0F8", color: "#601050", border: "1px solid #E8B8E0" } },
  "Writing \u2013 Original Draft": { bar: "#9B2335", badge: { background: "#FDF2F4", color: "#6A0F1E", border: "1px solid #F0B8C0" } },
  "Writing \u2013 Review & Editing": { bar: "#3D4FA0", badge: { background: "#EEF0FA", color: "#232E6A", border: "1px solid #B8C0F0" } },
};

export const DEFAULT_STYLE = {
  bar: "#2D6A4F",
  badge: { background: "#EBF5EF", color: "#1B4332", border: "1px solid #A8D8BE" },
};

export const DISPUTE_BADGE = {
  background: "#FEF2F2",
  color: "#991B1B",
  border: "1px solid #FECACA",
};