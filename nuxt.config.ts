import tailwindcss from "@tailwindcss/vite";

export default defineNuxtConfig({
  future: { compatibilityVersion: 4 },
  compatibilityDate: "2025-05-01",

  app: {
    head: {
      title: "Cycloid Drawing Machine",
      meta: [{ name: "viewport", content: "width=device-width, initial-scale=1" }],
      htmlAttrs: { lang: "en", class: "h-full" },
      bodyAttrs: {
        class: "h-full overflow-hidden bg-base text-primary transition-colors duration-400",
      },
    },
  },

  modules: [
    "@unocss/nuxt",
  ],

  css: ["~/assets/css/main.css"],

  vite: {
    plugins: [tailwindcss()],
  },

  // SSR off — this is a client-side canvas drawing tool
  ssr: false,

  devtools: { enabled: false },
});
