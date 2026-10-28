import type { MetadataRoute } from "next";

// Makes the site installable ("Přidat na plochu"); iOS only allows push notifications for installed web apps.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nanečisto",
    short_name: "Nanečisto",
    description: "Testy na čas, rozbor každé chyby s AI lektorem a trénink úloh, které ti nejdou.",
    lang: "cs",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#f7f6fb",
    theme_color: "#f7f6fb",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
