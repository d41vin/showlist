import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/", destination: "/browse" },
      { source: "/discover", destination: "/browse/discover" },
    ]
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
        pathname: "/t/p/**",
      },
    ],
  },
}

export default nextConfig
