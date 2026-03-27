import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import fs from "node:fs";
import path from "node:path";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".csv": "text/csv; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".json": "application/json",
};

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    {
      name: "serve-output",
      configureServer(server) {
        // Serve output/* at /output/*
        server.middlewares.use("/output", (req, res, next) => {
          const url = decodeURIComponent((req.url ?? "/").split("?")[0]!);
          const filePath = path.join(process.cwd(), "output", url);
          try {
            if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
              res.setHeader("Content-Type", MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream");
              res.setHeader("Cache-Control", "no-cache");
              fs.createReadStream(filePath).pipe(res as NodeJS.WritableStream);
            } else {
              next();
            }
          } catch {
            next();
          }
        });

        // Serve target reference images at /target/* (files from data/)
        server.middlewares.use("/target", (req, res, next) => {
          const url = decodeURIComponent((req.url ?? "/").split("?")[0]!);
          const name = url === "/" ? "IMG_6777.jpeg" : url.replace(/^\//, "");
          const filePath = path.join(process.cwd(), "data", name);
          // Security: must stay inside data/
          if (!filePath.startsWith(path.join(process.cwd(), "data"))) { next(); return; }
          try {
            if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
              res.setHeader("Content-Type", MIME[path.extname(filePath).toLowerCase()] ?? "image/jpeg");
              res.setHeader("Cache-Control", "no-cache");
              fs.createReadStream(filePath).pipe(res as NodeJS.WritableStream);
            } else {
              next();
            }
          } catch {
            next();
          }
        });
      },
    },
  ],
  root: ".",
  build: { outDir: "dist" },
});
