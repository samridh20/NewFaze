/** @type {import('next').NextConfig} */
// Keep production output away from the live dev cache. Next can otherwise replace
// chunks beneath a running dev server, which leaves it failing with "Cannot find
// module './<chunk>.js'" until the cache and process are restarted.
const defaultDistDir = process.env.NODE_ENV === "production" ? ".next-build" : ".next";

export default {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || defaultDistDir,
};
