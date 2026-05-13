import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Apply these headers to all routes in your application
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            // Allows standard scripts, inline scripts, and the eval() required by ethers.js
            value: "script-src 'self' 'unsafe-eval' 'unsafe-inline';",
          },
        ],
      },
    ];
  },
};

export default nextConfig;