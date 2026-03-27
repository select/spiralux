/**
 * Cycloid Drawing Machine — accurate mechanical simulation.
 *
 * Models the real Nolan Gandy machine:
 *   - A motor drives everything via belts
 *   - Two perpendicular slide arms (X and Y)
 *   - Each arm has a chain of gears connected by belts
 *   - Each gear has a crank pin converting rotation → linear oscillation
 *   - The paper table also rotates from the motor
 *
 * Pen position on paper:
 *   X_arm(θ) = Σ crankRadius_i × cos(effectiveRatio_i × θ + phase_i)
 *   Y_arm(θ) = Σ crankRadius_j × cos(effectiveRatio_j × θ + phase_j)
 *   Then rotate (X, Y) by paper table angle to get position on paper.
 */

export interface Gear {
  /** Number of teeth on this gear (determines belt ratio with neighbors) */
  teeth: number;
  /** Crank pin distance from center (0 = no contribution) */
  crankRadius: number;
  /** Phase offset in radians */
  phase: number;
}

export interface GearArm {
  /** Chain of gears connected by belts. Adjacent gears are belt-coupled. */
  gears: Gear[];
}

export interface MachineConfig {
  /** X-axis slide arm (horizontal) */
  xArm: GearArm;
  /** Y-axis slide arm (vertical) */
  yArm: GearArm;
  /** Number of teeth on the motor drive gear */
  driveTeeth: number;
  /** Number of teeth on the paper table gear (0 = no rotation) */
  tableTeeth: number;
  /** Radians of motor rotation per animation step */
  speed: number;
  /** Stroke line width in px */
  lineWidth: number;
}

/**
 * Compute the effective rotation speed of each gear in a chain.
 * With belt drives: gear_i speed = prev_speed × (prev_teeth / gear_i_teeth)
 * First gear is driven directly from the motor drive gear.
 */
export function gearSpeeds(arm: GearArm, driveTeeth: number): number[] {
  const speeds: number[] = [];
  for (let i = 0; i < arm.gears.length; i++) {
    const gear = arm.gears[i]!;
    if (i === 0) {
      // First gear driven directly from motor drive gear
      speeds.push(driveTeeth / gear.teeth);
    } else {
      // Belt-coupled to previous gear
      const prevGear = arm.gears[i - 1]!;
      speeds.push(speeds[i - 1]! * (prevGear.teeth / gear.teeth));
    }
  }
  return speeds;
}

/**
 * Compute the linear displacement of a slide arm at motor angle θ.
 * Each gear's crank converts rotation to: crankRadius × cos(ω × θ + phase)
 */
export function armDisplacement(arm: GearArm, driveTeeth: number, theta: number): number {
  const speeds = gearSpeeds(arm, driveTeeth);
  let displacement = 0;
  for (let i = 0; i < arm.gears.length; i++) {
    const gear = arm.gears[i]!;
    if (gear.crankRadius === 0) continue;
    displacement += gear.crankRadius * Math.cos(speeds[i]! * theta + gear.phase);
  }
  return displacement;
}

/**
 * Compute pen position on the paper at motor angle θ.
 */
export function penPosition(config: MachineConfig, theta: number): { x: number; y: number } {
  // Arm displacements (linear, along their axes)
  const xDisp = armDisplacement(config.xArm, config.driveTeeth, theta);
  const yDisp = armDisplacement(config.yArm, config.driveTeeth, theta);

  // Paper table rotation
  if (config.tableTeeth > 0) {
    const tableSpeed = config.driveTeeth / config.tableTeeth;
    const tableAngle = -tableSpeed * theta;
    const cosA = Math.cos(tableAngle);
    const sinA = Math.sin(tableAngle);
    return {
      x: xDisp * cosA - yDisp * sinA,
      y: xDisp * sinA + yDisp * cosA,
    };
  }

  return { x: xDisp, y: yDisp };
}

/* ═══════════════════════════════════════════════════════════════
 * EPICYCLIC ENGINE — nested circular orbits ("wheels on wheels")
 *
 * Each orbit is a gear mounted on the arm of the previous gear,
 * rotating at its own speed. The pen rides on the outermost gear.
 *
 * Pen position:
 *   x = Σ radius_i × cos(speed_i × θ + phase_i)
 *   y = Σ radius_i × sin(speed_i × θ + phase_i)
 *
 * Negative speed = clockwise rotation (gear meshes externally).
 * Positive speed = counter-clockwise (gear meshes internally or belt).
 *
 * This naturally produces spirograph / Fourier epicycle curves.
 * ═══════════════════════════════════════════════════════════════ */

export interface Orbit {
  /** Arm length — distance from parent gear's center to this gear's center */
  radius: number;
  /** Rotation speed multiplier (negative = clockwise) */
  speed: number;
  /** Initial phase offset in radians */
  phase: number;
}

export interface EpicyclicConfig {
  /** Nested circular orbits — pen is at the tip of the last one */
  orbits: Orbit[];
  /** Paper table teeth (0 = no table rotation) */
  tableTeeth: number;
  /** Motor drive gear teeth (for table speed calculation) */
  driveTeeth: number;
  /** Radians of motor rotation per step */
  speed: number;
  /** Stroke line width in px */
  lineWidth: number;
}

/**
 * Compute pen position for epicyclic (wheels-on-wheels) config.
 */
export function epicyclicPenPosition(config: EpicyclicConfig, theta: number): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (const orbit of config.orbits) {
    const angle = orbit.speed * theta + orbit.phase;
    x += orbit.radius * Math.cos(angle);
    y += orbit.radius * Math.sin(angle);
  }

  // Paper table rotation (same as linear model)
  if (config.tableTeeth > 0) {
    const tableSpeed = config.driveTeeth / config.tableTeeth;
    const tableAngle = -tableSpeed * theta;
    const cosA = Math.cos(tableAngle);
    const sinA = Math.sin(tableAngle);
    return {
      x: x * cosA - y * sinA,
      y: x * sinA + y * cosA,
    };
  }

  return { x, y };
}

/* ---- Defaults ---- */

export function defaultGear(teeth = 60, crankRadius = 80, phase = 0): Gear {
  return { teeth, crankRadius, phase };
}

export function defaultConfig(): MachineConfig {
  return {
    xArm: {
      gears: [
        { teeth: 60, crankRadius: 100, phase: 0 },
        { teeth: 40, crankRadius: 60, phase: 0 },
      ],
    },
    yArm: {
      gears: [
        { teeth: 80, crankRadius: 90, phase: 0 },
        { teeth: 30, crankRadius: 50, phase: Math.PI / 4 },
      ],
    },
    driveTeeth: 20,
    tableTeeth: 0,
    speed: 0.02,
    lineWidth: 0.8,
  };
}
