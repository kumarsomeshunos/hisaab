import type { NextConfig } from "next";
// @ts-ignore – next-pwa has no bundled types
import withPWA from "next-pwa";

const nextConfig: NextConfig = {};

export default withPWA({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  customWorkerSrc: "src/worker",
})(nextConfig);
