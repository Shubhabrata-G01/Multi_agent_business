/** @type {import('next').NextConfig} */
const nextConfig = {
  // The orchestrator makes long-running, sequential Anthropic API calls
  // (~81 steps per run) from a Node.js API route rather than an edge/
  // serverless function, so it is not bound by short serverless timeouts.
  reactStrictMode: true,

  // STEP 4 item 14: baseline security headers on every response.
  //
  // script-src allows 'unsafe-inline': Next's App Router streams RSC
  // hydration data via inline <script>self.__next_f.push(...)</script> tags
  // with no nonce by default - verified live (see webapp/README.md's
  // "Security headers" note) that script-src 'self' alone blocks these and
  // breaks hydration completely (every page renders blank). A nonce-based
  // CSP (Next supports this via middleware generating a per-request nonce)
  // would let script-src drop 'unsafe-inline' - noted as a follow-up
  // hardening step, not implemented here to avoid this pass's biggest
  // regression risk. This still blocks loading any THIRD-PARTY script
  // (script-src has no external origins), which is the main injection risk
  // for an app with no third-party scripts of its own.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
              "img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; " +
              "base-uri 'self'; form-action 'self'",
          },
        ],
      },
    ];
  },

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
