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
  }
};

module.exports = nextConfig;
