/**
 * utils/pinata.js
 * ─────────────────────────────────────────────────────────────────────────────
 * IPFS upload utility for the DLT Proof-of-Priority system.
 * Uses the Pinata REST API to pin files and return their CID.
 *
 * ── ENVIRONMENT SETUP ────────────────────────────────────────────────────────
 * Create a `.env.local` file in your project root (NEVER commit this file).
 * Add it to .gitignore immediately.
 *
 *   # .env.local
 *   NEXT_PUBLIC_PINATA_GATEWAY=https://gateway.pinata.cloud/ipfs
 *   PINATA_JWT=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...  ← your Pinata JWT
 *
 * SECURITY NOTES:
 *  • PINATA_JWT has NO "NEXT_PUBLIC_" prefix → it is SERVER-SIDE ONLY.
 *    It will never be exposed to the browser bundle.
 *  • Call this utility only from a Next.js API Route (pages/api or app/api),
 *    not directly from a client component. The component sends the file to
 *    YOUR API route, which then calls Pinata server-side.
 *  • If you must call Pinata from the client (dev/demo only), use a
 *    NEXT_PUBLIC_ scoped key with the narrowest possible Pinata permissions
 *    (pin only, no unpin/delete), and rotate it often.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const PINATA_API_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS";

/**
 * Uploads a File (or Blob) object to IPFS via Pinata.
 *
 * @param {File} file          - The file object from an <input type="file"> element.
 * @param {string} [label]     - Optional human-readable label stored in Pinata metadata.
 * @returns {Promise<string>}  - Resolves to the IPFS CID (IpfsHash) string.
 * @throws {Error}             - Throws a descriptive error on network or API failure.
 *
 * @example
 *   // Inside a Next.js API Route (app/api/upload/route.js):
 *   import { uploadFileToIPFS } from "@/utils/pinata";
 *
 *   export async function POST(request) {
 *     const formData = await request.formData();
 *     const file = formData.get("file");
 *     const cid = await uploadFileToIPFS(file, "Research Evidence");
 *     return Response.json({ cid });
 *   }
 */
export async function uploadFileToIPFS(file, label = "DLT Research Artifact") {
  // ── Retrieve the JWT from environment ─────────────────────────────────────
  // In a Next.js API Route, process.env works directly.
  // In a client component (not recommended for production), use
  // process.env.NEXT_PUBLIC_PINATA_JWT instead.
  const jwt = process.env.PINATA_JWT;

  if (!jwt) {
    throw new Error(
      "PINATA_JWT is not set. Add it to your .env.local file and " +
        "ensure this function is called from a server-side API route."
    );
  }

  if (!file || !(file instanceof Blob)) {
    throw new Error("Invalid file: expected a File or Blob object.");
  }

  // ── Build the multipart/form-data payload ──────────────────────────────────
  const body = new FormData();
  body.append("file", file);

  // Pinata metadata (stored off-chain in Pinata's index; not part of the CID)
  const metadata = JSON.stringify({
    name: label,
    keyvalues: {
      project: "DLT-Proof-of-Priority",
      uploadedAt: new Date().toISOString(),
    },
  });
  body.append("pinataMetadata", metadata);

  // Pinata options – wrapWithDirectory: false keeps a clean, direct CID
  const options = JSON.stringify({ cidVersion: 1, wrapWithDirectory: false });
  body.append("pinataOptions", options);

  // ── Make the API call ──────────────────────────────────────────────────────
  let response;
  try {
    response = await fetch(PINATA_API_URL, {
      method: "POST",
      headers: {
        // Do NOT set Content-Type manually – fetch sets the boundary automatically
        Authorization: `Bearer ${jwt}`,
      },
      body,
    });
  } catch (networkError) {
    throw new Error(`Network error while contacting Pinata: ${networkError.message}`);
  }

  // ── Handle non-2xx responses ───────────────────────────────────────────────
  if (!response.ok) {
    let detail = "";
    try {
      const errorBody = await response.json();
      detail = errorBody?.error?.details ?? JSON.stringify(errorBody);
    } catch {
      detail = await response.text();
    }
    throw new Error(`Pinata API error (${response.status}): ${detail}`);
  }

  // ── Parse and return the CID ───────────────────────────────────────────────
  const data = await response.json();

  if (!data.IpfsHash) {
    throw new Error("Pinata response did not contain an IpfsHash. Raw: " + JSON.stringify(data));
  }

  return data.IpfsHash; // e.g. "bafybeig..."
}

/**
 * Convenience helper: builds the full IPFS gateway URL from a CID.
 *
 * @param {string} cid
 * @returns {string}
 */
export function buildGatewayUrl(cid) {
  const gateway =
    process.env.NEXT_PUBLIC_PINATA_GATEWAY ?? "https://gateway.pinata.cloud/ipfs";
  return `${gateway.replace(/\/$/, "")}/${cid}`;
}
