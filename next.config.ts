import type { NextConfig } from 'next';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import withSerwistInit from '@serwist/next';

const revision =
  process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
  process.env.CF_PAGES_COMMIT_SHA?.trim() ||
  (() => {
    try {
      return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
    } catch {
      return randomUUID();
    }
  })();

const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
  additionalPrecacheEntries: [{ url: '/~offline', revision }],
});

const nextConfig: NextConfig = {
  turbopack: {},
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};

export default withSerwist(nextConfig);
