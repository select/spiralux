import { defineConfig, presetUno, presetIcons } from "unocss";
import fs from "node:fs/promises";

const loadIcon = (name: string) => () =>
  fs.readFile(`./app/assets/icons/${name}.svg`, "utf-8");

export default defineConfig({
  presets: [
    presetUno(),
    presetIcons({
      scale: 1.2,
      extraProperties: {
        display: "inline-block",
        "vertical-align": "middle",
      },
      collections: {
        app: {
          "node-sharp": loadIcon("node-sharp"),
          "node-smooth": loadIcon("node-smooth"),
          "node-symmetric": loadIcon("node-symmetric"),
          "node-auto": loadIcon("node-auto"),
        },
      },
    }),
  ],
});
