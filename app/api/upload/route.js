/**
 * app/api/upload/route.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Server-side Next.js App Router API Route that proxies file uploads to Pinata.
 * This keeps PINATA_JWT off the client bundle entirely.
 *
 * The LogContributionForm.jsx component POSTs FormData here.
 * This route calls uploadFileToIPFS() and returns { cid }.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import { uploadFileToIPFS } from "@/utils/pinata";

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const label = formData.get("label") ?? "DLT Research Artifact";

    if (!file || typeof file === "string") {
      return NextResponse.json({ message: "No valid file received." }, { status: 400 });
    }

    const cid = await uploadFileToIPFS(file, label);
    return NextResponse.json({ cid }, { status: 200 });
  } catch (err) {
    console.error("[/api/upload] Error:", err);
    return NextResponse.json(
      { message: err?.message ?? "Internal server error during IPFS upload." },
      { status: 500 }
    );
  }
}
