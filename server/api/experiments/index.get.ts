/**
 * GET /api/experiments — returns all experiments parsed from CSV.
 */
import fs from "node:fs";
import path from "node:path";
import { parseCSV, mapRow } from "~/utils/experiments";

export default defineEventHandler(() => {
  const csvPath = path.join(process.cwd(), "output", "experiments.csv");
  try {
    const text = fs.readFileSync(csvPath, "utf-8");
    return parseCSV(text).map(mapRow);
  } catch {
    return [];
  }
});
