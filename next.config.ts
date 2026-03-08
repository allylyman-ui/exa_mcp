import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // MCP handler needs longer function timeout
  serverExternalPackages: ["exa-js"],
};

export default nextConfig;
