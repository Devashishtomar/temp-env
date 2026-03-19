/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  swcMinify: false, // Disable SWC minification in development
  experimental: {
    serverComponentsExternalPackages: ['openai', 'groq-sdk'],
    outputFileTracingExcludes: {
      '*': [
        '**/uploads/**',
      ],
    },
  },

};

export default nextConfig; 