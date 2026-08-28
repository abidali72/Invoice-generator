/** @type {import('next').NextConfig} */
const nextConfig = {
  // Load PDFKit natively in the Node runtime so its bundled AFM font
  // metrics resolve correctly (avoids webpack asset mangling).
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
