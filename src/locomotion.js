// Port of asmrdroid.locomotion.controller.TripodReference(profile="lifted").
// The parameters are the checked-in fitted gait files, loaded by simulation.js.
const TRIPOD_A = new Set([0, 2, 4]); // LF, LR, RM
const SIDES = [-1, -1, -1, 1, 1, 1];
const NOMINAL_FORWARD = 0.01;
const NOMINAL_YAW = Math.PI / 6;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export function gaitTargets(time, forward, yaw, walk, turn, steering = 0) {
  const walkWeight = clamp(forward / NOMINAL_FORWARD, 0, 1.35);
  const turnWeight = clamp(Math.abs(yaw) / NOMINAL_YAW, 0, 1.35);
  const total = walkWeight + turnWeight;
  const period = total > 1e-6
    ? (walkWeight * walk.period_s + turnWeight * turn.period_s) / total
    : walk.period_s;
  const phase = 2 * Math.PI * time / period;
  const out = new Float64Array(18);
  for (let leg = 0; leg < 6; leg++) {
    const phi = phase + (TRIPOD_A.has(leg) ? 0 : Math.PI);
    const swing = Math.max(0, Math.sin(phi));
    const turnSign = yaw ? -Math.sign(yaw) : 0;
    let hip = (SIDES[leg] * walkWeight * walk.yaw_amp + turnSign * turnWeight * turn.yaw_amp) * Math.cos(phi);
    if (forward > 0 && steering) {
      const steeringWeight = clamp(Math.abs(steering) / NOMINAL_YAW, 0, 1);
      hip += -Math.sign(steering) * steeringWeight * turn.yaw_amp * Math.cos(phi);
    }
    const lift = Math.max(walkWeight * walk.lift_amp, turnWeight * turn.lift_amp);
    const knee = Math.max(walkWeight * walk.knee_amp, turnWeight * turn.knee_amp);
    out[leg * 3] = clamp(hip, -0.25, 0.25);
    out[leg * 3 + 1] = clamp(walk.stance_pitch_rad - lift * swing, 0.05, 0.35);
    out[leg * 3 + 2] = clamp(knee * swing, 0, 0.7);
  }
  return out;
}
