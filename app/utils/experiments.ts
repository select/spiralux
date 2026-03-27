/**
 * Experiment data types + CSV parsing — shared between pages and server.
 */

export interface Experiment {
  id: number;
  timestamp: string;
  steps: number;
  passes: number;
  colors: string[];
  driveTeeth: number;
  xArmGears: string;
  yArmGears: string;
  tableTeeth: number;
  speed: number;
  lineWidth: number;
  width: number;
  height: number;
  background: string;
  notes: string;
  svgFile: string;
  pngFile: string;
  target: string;
}

export function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current); current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

export function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n");
  const headers = parseCSVLine(lines[0]!);
  return lines.slice(1)
    .filter(l => l.trim())
    .map(line => {
      const values = parseCSVLine(line);
      return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
    });
}

export function mapRow(r: Record<string, string>): Experiment {
  return {
    id: parseInt(r.id!),
    timestamp: r.timestamp!,
    steps: parseInt(r.steps!),
    passes: parseInt(r.passes!),
    colors: (r.colors ?? "#333").split(";"),
    driveTeeth: parseInt(r.drive_teeth!),
    xArmGears: r.x_arm_gears ?? "",
    yArmGears: r.y_arm_gears ?? "",
    tableTeeth: parseInt(r.table_teeth ?? "0"),
    speed: parseFloat(r.speed!),
    lineWidth: parseFloat(r.line_width!),
    width: parseInt(r.width!),
    height: parseInt(r.height!),
    background: r.background!,
    notes: r.notes ?? "",
    svgFile: r.svg_file ?? "",
    pngFile: r.png_file ?? "",
    target: r.target ?? "IMG_6777.jpeg",
  };
}
