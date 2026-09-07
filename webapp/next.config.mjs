/** @type {import('next').NextConfig} */
const nextConfig = {
  // The orchestrator makes long-running, sequential Anthropic API calls
  // (~81 steps per run) from a Node.js API route rather than an edge/
  // serverless function, so it is not bound by short serverless timeouts.
  reactStrictMode: true,
};

export default nextConfig;
