/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ["@vaultys/id"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              // tile.openstreetmap.org: the /admin/map world map's basemap
              // (components/map/world-map/tiles.ts). Named explicitly rather than allowing
              // https: wholesale — the allow-list is the reason a stale tile host shows up as a
              // blocked request instead of silently working, which is how the previous provider's
              // removal was caught. A deployment pointing NEXT_PUBLIC_MAP_TILE_URL at its own tile
              // server must add that origin here too.
              "img-src 'self' data: blob: https://*.tile.openstreetmap.org",
              "font-src 'self' data:",
              "connect-src 'self' wss: ws: https:",
              "worker-src 'self' blob:",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
