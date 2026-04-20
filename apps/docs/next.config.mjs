/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    outputFileTracingIncludes: {
      "/*": ["../../docs/**/*", "../../orchard/**/*"],
    },
  },
};

export default nextConfig;
