/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    FLASK_BACKEND_URL: process.env.FLASK_BACKEND_URL,
  },
};

export default nextConfig;
