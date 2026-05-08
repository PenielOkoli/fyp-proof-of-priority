import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#080808] text-white flex flex-col items-center justify-center p-10">
      <div className="max-w-xl w-full space-y-6">
        <div className="border-b border-[#1a1a1a] pb-6">
          <p className="text-[10px] tracking-[0.3em] uppercase text-[#555] mb-2 font-mono">
            Decentralized Ledger Technology
          </p>
          <h1 className="text-4xl font-bold tracking-tight">
            Proof-of-Priority System
          </h1>
          <p className="text-[#555] text-sm mt-2 font-mono">
            Immutable authorship validation for academic research.
          </p>
        </div>

        <div className="space-y-3">
          <p className="text-[#444] text-xs font-mono uppercase tracking-widest">
            Active Projects
          </p>
          <Link
            href="/project/project-alpha-001"
            className="flex items-center justify-between w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl px-5 py-4 hover:border-[#00ffa3]/40 transition-colors group"
          >
            <div>
              <p className="text-white font-mono font-semibold">project-alpha-001</p>
              <p className="text-[#555] text-xs mt-1">Sepolia Testnet</p>
            </div>
            <span className="text-[#333] group-hover:text-[#00ffa3] transition-colors text-lg">→</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
