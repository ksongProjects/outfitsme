import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: "standalone",
  async redirects() {
    return [
      {
        source: "/analysis",
        destination: "/",
        permanent: false,
      },
      {
        source: "/outfits",
        destination: "/",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
