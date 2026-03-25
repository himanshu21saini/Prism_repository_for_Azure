/** @type {import('next').NextConfig} */
const nextConfig = {
  // Increase body size limit for dataset upload route
  // Default is 4.5MB — datasets can be larger
  experimental: {
    serverActions: {
      bodySizeLimit: '25mb',
    },
  },
}

module.exports = nextConfig
