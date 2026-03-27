/**
 * GET /api/experiments/:id — returns a single experiment by numeric ID.
 */
import fs from "node:fs";
import path from "node:path";
import { parseCSV, mapRow } from "~/utils/experiments";

export default defineEventHandler((event) => {
  const id = parseInt(getRouterParam(event, "id") ?? "");
  if (isNaN(id)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid experiment ID" });
  }

  const csvPath = path.join(process.cwd(), "output", "experiments.csv");
  try {
    const text = fs.readFileSync(csvPath, "utf-8");
    const experiments = parseCSV(text).map(mapRow);
    const exp = experiments.find(e => e.id === id);
    if (!exp) {
      throw createError({ statusCode: 404, statusMessage: `Experiment ${id} not found` });
    }
    return exp;
  } catch (e: unknown) {
    if (e && typeof e === "object" && "statusCode" in e) throw e;
    throw createError({ statusCode: 500, statusMessage: "Failed to read experiments" });
  }
});
