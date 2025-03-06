/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['utfs.io']
  },
  env: {
    INSTANCE_MANAGER_URL: process.env.INSTANCE_MANAGER_URL
  },
  // Make environment variables available to the browser
  publicRuntimeConfig: {
    INSTANCE_MANAGER_URL: process.env.INSTANCE_MANAGER_URL
  },
  // Enable standalone output for Docker deployment
  output: 'standalone',
  
  // Security headers configuration
  poweredByHeader: false, // Remove X-Powered-By header
  
  // Configure headers for additional security
  async headers() {
    return [
      {
        // Apply these headers to all routes
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'X-Download-Options',
            value: 'noopen',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
