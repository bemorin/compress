import type { NextConfig } from "next";

// Compression runs in the browser; the page is a static export served by Cloudflare Pages.
// The two routes in functions/ (reading a web page) are Pages Functions, deployed alongside.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "export",
  trailingSlash: true,
};

export default nextConfig;
