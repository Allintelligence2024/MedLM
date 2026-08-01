/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Sortie autonome : l'image Docker n'embarque que le serveur minimal
  // + les node_modules réellement tracés (cf. cms/Dockerfile).
  output: 'standalone',
  experimental: { typedRoutes: true },
};
export default nextConfig;
