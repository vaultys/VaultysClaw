/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@roamhq/wrtc", "@vaultys/channel-peerjs"],
  // Suppress middleware deprecation warning - we use middleware for auth, not for proxying
  experimental: {
    optimizePackageImports: ["@vaultys/id"],
  },
};

module.exports = nextConfig;
