/**
 * curveSampler.js
 * 
 * Evaluates Unity AnimationCurve keyframes using Hermite cubic interpolation.
 * This mirrors Unity's AnimationCurve.Evaluate() behavior.
 */

/**
 * Sample a value from keyframe curve data at a given time.
 * Supports Hermite cubic interpolation using inSlope/outSlope tangents.
 * 
 * @param {Array<{time: number, value: number, inSlope?: number, outSlope?: number}>} keyframes
 * @param {number} time - Current time to sample at
 * @param {boolean} loop - Whether the animation loops
 * @param {number} duration - Total duration for looping
 * @returns {number} Interpolated value at the given time
 */
export function sampleCurve(keyframes, time, loop = true, duration = 0) {
  if (!keyframes || keyframes.length === 0) return 0;
  if (keyframes.length === 1) return keyframes[0].value;

  // Handle looping
  if (loop && duration > 0) {
    time = time % duration;
  }

  // Clamp to range
  if (time <= keyframes[0].time) return keyframes[0].value;
  if (time >= keyframes[keyframes.length - 1].time) return keyframes[keyframes.length - 1].value;

  // Find the two keyframes surrounding our time
  let i = 0;
  for (i = 0; i < keyframes.length - 1; i++) {
    if (time >= keyframes[i].time && time < keyframes[i + 1].time) break;
  }

  const kf0 = keyframes[i];
  const kf1 = keyframes[i + 1];

  const dt = kf1.time - kf0.time;
  if (dt <= 0) return kf0.value;

  // Normalized time within segment [0, 1]
  const t = (time - kf0.time) / dt;

  // Hermite cubic interpolation (matches Unity's curve evaluation)
  const outTangent = (kf0.outSlope || 0) * dt;
  const inTangent = (kf1.inSlope || 0) * dt;

  const t2 = t * t;
  const t3 = t2 * t;

  // Hermite basis functions
  const h00 = 2 * t3 - 3 * t2 + 1;       // value at kf0
  const h10 = t3 - 2 * t2 + t;            // tangent at kf0
  const h01 = -2 * t3 + 3 * t2;           // value at kf1
  const h11 = t3 - t2;                     // tangent at kf1

  return h00 * kf0.value + h10 * outTangent + h01 * kf1.value + h11 * inTangent;
}

/**
 * Sample all curves in a clip at a given time.
 * Returns an object mapping attribute names to their interpolated values.
 * 
 * @param {Object} clip - Animation clip with { duration, loop, curves }
 * @param {number} time - Current time to sample at
 * @returns {Object<string, number>} Map of attribute name → value
 */
export function sampleClip(clip, time) {
  const result = {};
  if (!clip || !clip.curves) return result;

  for (const [attr, keyframes] of Object.entries(clip.curves)) {
    result[attr] = sampleCurve(keyframes, time, clip.loop, clip.duration);
  }
  return result;
}

/**
 * Blend between two sampled clip results.
 * 
 * @param {Object<string, number>} from - Sampled values from clip A
 * @param {Object<string, number>} to - Sampled values from clip B
 * @param {number} t - Blend factor [0=from, 1=to]
 * @returns {Object<string, number>} Blended values
 */
export function blendClips(from, to, t) {
  const result = {};
  const allKeys = new Set([...Object.keys(from), ...Object.keys(to)]);

  for (const key of allKeys) {
    const a = from[key] || 0;
    const b = to[key] || 0;
    result[key] = a + (b - a) * t;
  }
  return result;
}
