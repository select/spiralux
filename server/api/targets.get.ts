/**
 * GET /api/targets — returns all image files in data/ as TargetInfo[].
 */
import fs from "node:fs";
import path from "node:path";
import { KNOWN_TARGETS, makeTargetInfo } from "~/utils/targets";

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);

export default defineEventHandler(() => {
  const dataDir = path.join(process.cwd(), "data");
  try {
    const files = fs.readdirSync(dataDir)
      .filter((f: string) => IMAGE_EXTS.has(path.extname(f).toLowerCase()) && !f.startsWith("."))
      .sort();
    return files.map((f: string) => makeTargetInfo(f));
  } catch {
    return KNOWN_TARGETS;
  }
});
