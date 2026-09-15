/** @type {import('next').NextConfig} */
const nextConfig = {
  // The orchestrator makes long-running, sequential Anthropic API calls
  // (~81 steps per run) from a Node.js API route rather than an edge/
  // serverless function, so it is not bound by short serverless timeouts.
  reactStrictMode: true,

  webpack: (config, { dev }) => {
    if (dev) {
      // Next's persistent webpack dev cache (.next/cache/webpack/*.pack.gz)
      // has repeatedly corrupted itself on Windows in this project -
      // "ENOENT ... N.pack.gz" followed by "Cannot find module './NNN.js'"
      // on the very next request. Disabling it trades slightly slower
      // rebuilds between dev-server restarts for not hitting this class of
      // failure mid-session. If dev rebuilds start feeling too slow to
      // live with, an alternative is to keep the cache but make sure
      // nothing (antivirus real-time scanning, a sync client, another
      // process) is touching .next/cache while the dev server runs.
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;
