import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Smart Home Dashboard",
    short_name: "Smart Home",
    description: "Smart Home Dashboard for home-butler.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F2F2F4",
    theme_color: "#F2F2F4",
    orientation: "portrait",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
