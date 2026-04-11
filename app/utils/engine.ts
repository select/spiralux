/**
 * Spiralux engine — accurate mechanical simulation.
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
 * This naturally produces spiralux / Fourier epicycle curves.
 * ═══════════════════════════════════════════════════════════════ */

export interface RadiusMod {
  /**
   * Slow amplitude modulation applied to this orbit's radius.
   * Models a connected gear that physically changes the crank-pin
   * distance over time — the "unbalanced gear that changes size".
   *
   *   r(θ) = radius + amplitude × sin(freq × θ + phase)
   *
   * Use irrational freq values (√2, √3, √5…) for aperiodic,
   * pseudo-random-looking variation that never exactly repeats.
   */
  amplitude: number;   // ± variation in px
  freq: number;        // modulation speed (radians⁻¹)
  phase: number;       // initial phase of the modulation
}

export interface Orbit {
  /** Arm length — nominal crank-pin distance from gear center */
  radius: number;
  /** Rotation speed multiplier (negative = clockwise) */
  speed: number;
  /** Initial phase offset in radians */
  phase: number;
  /** Optional slow radius modulation — gear size varies over time */
  mod?: RadiusMod;
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
    // Apply optional radius modulation — gear size varies over time
    const r = orbit.mod
      ? orbit.radius + orbit.mod.amplitude * Math.sin(orbit.mod.freq * theta + orbit.mod.phase)
      : orbit.radius;
    const angle = orbit.speed * theta + orbit.phase;
    x += r * Math.cos(angle);
    y += r * Math.sin(angle);
  }

  // Paper table rotation
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

/* ═══════════════════════════════════════════════════════════════
 * SPIRAL ENGINE — Archimedean spiral + sinusoidal wobbles
 *
 * The pen traces an outward spiral whose radius grows linearly
 * with θ, plus any number of sinusoidal wobbles layered on top.
 *
 *   r(θ) = growth × θ  +  Σ wobble_i.amplitude × sin(wobble_i.freq × θ + wobble_i.phase)
 *   x = r(θ) × cos(θ)
 *   y = r(θ) × sin(θ)
 *
 * This naturally produces organic, wobbly spiral patterns.
 * ═══════════════════════════════════════════════════════════════ */

export interface Wobble {
  /** Amplitude of sinusoidal radius modulation (px) */
  amplitude: number;
  /** Frequency — wobble lobes per radian of spiral rotation */
  freq: number;
  /** Phase offset in radians */
  phase: number;
}

export interface SpiralOrbit {
  /** Distance of the spiral center from the canvas center (px) */
  radius: number;
  /** How fast the spiral center orbits (rotations per radian of θ) */
  speed: number;
  /** Phase offset for the orbit */
  phase: number;
  /** Offset the orbit center from the canvas center (px) */
  cx?: number;
  cy?: number;
  /** Smooth orbit radius envelope — shifts the center in/out along the path */
  radiusEnvelope?: SizeKeyframe[];
}

export interface SizeKeyframe {
  /** Position along the path (0 = start, 1 = end) */
  t: number;
  /** Loop radius at this point (px) */
  radius: number;
}

export interface SpiralConfig {
  /** Base loop radius — used when no envelope is set (px) */
  baseRadius: number;
  /** Radial growth per radian of LOCAL spin — spiral opens outward over time */
  growth: number;
  /** Sinusoidal wobbles layered on top of the interpolated radius */
  wobbles: Wobble[];
  /**
   * Smooth size envelope — keyframes interpolated with cosine easing.
   * t is 0–1 fraction of the path. Overrides baseRadius + growth when set.
   * Example: [{t:0, radius:10}, {t:0.5, radius:80}, {t:1, radius:10}]
   * Requires `duration` to compute the progress fraction.
   */
  envelope?: SizeKeyframe[];
  /** Total motor θ for this pass — needed for envelope interpolation */
  duration?: number;
  /** The spiral center orbits the canvas center at this radius/speed */
  orbit?: SpiralOrbit;
  /**
   * How fast the pen spins around the spiral center.
   * This is independent of the orbit speed — high spinSpeed with low
   * orbit.speed means many tight loops around a slowly moving center.
   * Default: 1
   */
  spinSpeed?: number;
  /**
   * Elongation factor — stretches spiral loops into ellipses along
   * the radial direction (away from canvas center).
   * 1 = perfect circles, 2 = ellipses twice as tall as wide, etc.
   * Can also be an envelope for varying elongation along the path.
   * Default: 1
   */
  elongation?: number | SizeKeyframe[];
  /**
   * Outward bias (0–1) — deforms each loop into an egg/teardrop shape.
   * The side pointing away from canvas center becomes fatter,
   * the inward side becomes thinner. Always oriented radially.
   * 0 = perfect circle/ellipse, 0.5 = noticeable egg, 1 = extreme.
   * Default: 0
   */
  outwardBias?: number;
  /**
   * Number of lobes/peaks per loop — modulates local radius with
   * a cosine harmonic: r *= (1 + lobeDepth * cos(lobes * localAngle)).
   * Creates rose/epitrochoid-like shapes instead of simple circles.
   * Default: 0 (no lobes, perfect circle/ellipse)
   */
  lobes?: number;
  /**
   * Depth of lobe modulation (0–1). 0 = no effect, 1 = full depth.
   * Default: 0.3
   */
  lobeDepth?: number;
  /** Radians of motor rotation per animation step */
  speed: number;
  /** Stroke line width in px */
  lineWidth: number;
}

/**
 * Compute pen position for spiral config at motor angle θ.
 *
 * The pen spins locally at spinSpeed × θ, spiraling outward from
 * its center. When orbit is set, that center itself orbits the
 * canvas center at a (typically much slower) orbit.speed.
 *
 *   localAngle = spinSpeed × θ
 *   r(localAngle) = growth × localAngle + Σ wobbles
 *   pen = orbitCenter + (r × cos(localAngle), r × sin(localAngle))
 */
/**
 * Cosine-interpolate between envelope keyframes for silky-smooth transitions.
 */
function interpolateEnvelope(envelope: SizeKeyframe[], t: number): number {
  if (envelope.length === 0) return 0;
  if (t <= envelope[0]!.t) return envelope[0]!.radius;
  if (t >= envelope[envelope.length - 1]!.t) return envelope[envelope.length - 1]!.radius;
  for (let i = 0; i < envelope.length - 1; i++) {
    const a = envelope[i]!;
    const b = envelope[i + 1]!;
    if (t >= a.t && t <= b.t) {
      const frac = (t - a.t) / (b.t - a.t);
      // Cosine interpolation — smooth ease in/out
      const mu = (1 - Math.cos(frac * Math.PI)) / 2;
      return a.radius + mu * (b.radius - a.radius);
    }
  }
  return envelope[envelope.length - 1]!.radius;
}

export function spiralPenPosition(config: SpiralConfig, theta: number): { x: number; y: number } {
  const spin = config.spinSpeed ?? 1;
  const localAngle = spin * theta;

  // Radius: envelope (smooth keyframes) or baseRadius + growth
  let r: number;
  if (config.envelope && config.envelope.length >= 2 && config.duration) {
    const t = Math.min(theta / config.duration, 1);
    r = interpolateEnvelope(config.envelope, t);
  } else {
    r = config.baseRadius + config.growth * localAngle;
  }

  // Add wobbles on top
  for (const w of config.wobbles) {
    r += w.amplitude * Math.sin(w.freq * localAngle + w.phase);
  }

  // Pen position relative to spiral center
  const lx = r * Math.cos(localAngle);
  const ly = r * Math.sin(localAngle);

  // Pen position: elliptical loops aligned to orbit radial direction
  if (config.orbit) {
    // Orbit radius can vary along the path via radiusEnvelope
    let orbitR = config.orbit.radius;
    if (config.orbit.radiusEnvelope && config.orbit.radiusEnvelope.length >= 2 && config.duration) {
      const t = Math.min(theta / config.duration, 1);
      orbitR = interpolateEnvelope(config.orbit.radiusEnvelope, t);
    }
    const oa = config.orbit.speed * theta + config.orbit.phase;

    // Compute elongation factor
    let elong = 1;
    if (config.elongation !== null && config.elongation !== undefined) {
      if (typeof config.elongation === "number") {
        elong = config.elongation;
      } else if (config.elongation.length >= 2 && config.duration) {
        const t = Math.min(theta / config.duration, 1);
        elong = interpolateEnvelope(config.elongation, t);
      }
    }

    // Outward bias — egg/teardrop shape per loop
    const bias = config.outwardBias ?? 0;
    if (bias > 0) {
      r *= (1 + bias * Math.cos(localAngle - oa));
    }

    // Lobe modulation — rose/epitrochoid shape per loop
    const lobes = config.lobes ?? 0;
    const lobeDepth = config.lobeDepth ?? 0.3;
    if (lobes > 0) {
      r *= (1 + lobeDepth * Math.cos(lobes * localAngle));
    }

    // Local spiral in orbit-aligned frame: radial (outward) × tangential
    const radialComp = r * elong * Math.cos(localAngle);   // stretched outward
    const tangentComp = r * Math.sin(localAngle);           // normal tangential

    // Rotate from orbit-aligned frame to canvas frame
    const cosOa = Math.cos(oa);
    const sinOa = Math.sin(oa);
    const olx = radialComp * cosOa - tangentComp * sinOa;
    const oly = radialComp * sinOa + tangentComp * cosOa;

    const cx = (config.orbit.cx ?? 0) + orbitR * cosOa;
    const cy = (config.orbit.cy ?? 0) + orbitR * sinOa;
    return { x: cx + olx, y: cy + oly };
  }

  return { x: lx, y: ly };
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
