import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  experimental: {
    serverActions: { bodySizeLimit: "20mb" }
  },
  async redirects() {
    return [{ source: "/", destination: "/dashboard", permanent: false }];
  }
};

export default config;
