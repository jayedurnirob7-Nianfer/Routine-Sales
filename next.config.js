/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  basePath: '/Routine-Sales',
  assetPrefix: '/Routine-Sales/',
};
module.exports = nextConfig;
