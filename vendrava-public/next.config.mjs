/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static HTML export for Apache/shared hosting (SWHosting, no Node runtime).
  // Generates ./out with plain .html files served by Apache via .htaccess.
  output: "export",
  // Emit every route as <route>/index.html so Apache serves it via
  // DirectoryIndex with no file-vs-directory conflicts, and canonical URLs
  // match the served (trailing-slash) URLs.
  trailingSlash: true,
  reactStrictMode: true,
  images: {
    // next/image optimization needs a server; disable for static export.
    unoptimized: true,
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
