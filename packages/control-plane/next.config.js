/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@roamhq/wrtc", "@vaultys/channel-peerjs"],
};

module.exports = nextConfig;
