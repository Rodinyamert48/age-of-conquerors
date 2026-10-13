import type { NextConfig } from 'next';

/**
 * STATIC_EXPORT=1 ile tamamen statik site üretilir (GitHub Pages vb.).
 * NEXT_PUBLIC_BASE_PATH, sitenin alt dizinde yayınlandığı yol (ör. /age-of-conquerors).
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

const nextConfig: NextConfig =
  process.env.STATIC_EXPORT === '1'
    ? { output: 'export', basePath, trailingSlash: true, images: { unoptimized: true } }
    : { basePath };

export default nextConfig;
