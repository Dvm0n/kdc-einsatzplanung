import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // erlaubt einen Test-Build neben dem laufenden Dev-Server (NEXT_DIST_DIR=.next-build)
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    // CSV/XLSX-Import der Anrufhistorie
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
