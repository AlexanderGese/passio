/** @type {import('next').NextConfig} */
// BASE_PATH is set by the GH Pages workflow to "/passio". Local dev and
// custom-domain deploys leave it empty.
const basePath = process.env.BASE_PATH ?? "";

const nextConfig = {
  reactStrictMode: true,
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  basePath,
  // The markdown + orchard reads happen in RSC at build time, so the
  // generated static output already contains everything it needs.
};

export default nextConfig;
