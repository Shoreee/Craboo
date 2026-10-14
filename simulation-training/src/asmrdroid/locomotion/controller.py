"""Shared tripod reference for the learned residual and the fixed-gait control."""
import json
import math

import mujoco
import numpy as np

from asmrdroid.common.paths import OUTPUTS
from asmrdroid.common.scale import LENGTH, NOMINAL_FORWARD_MPS, MAX_FORWARD_MPS


LEGS = ("LF", "LM", "LR", "RF", "RM", "RR")
JOINTS = ("hip_yaw", "hip_pitch", "knee")
TRIPOD_A = frozenset(("LF", "RM", "LR"))


class TripodReference:
    def __init__(self, model, profile="standard"):
        if profile not in {"standard", "fast", "gentle", "lifted"}:
            raise ValueError(f"Unknown gait profile: {profile}")
        self.profile = profile
        suffix = profile if profile in {"fast", "gentle", "lifted"} else "optimized"
        self.walk = json.loads((OUTPUTS / f"gait_walk_{suffix}.json").read_text(encoding="utf-8"))["parameters"]
        self.turn = json.loads((OUTPUTS / f"gait_turn_{suffix}.json").read_text(encoding="utf-8"))["parameters"]
        self.nominal_forward_mps = {"fast": .05, "gentle": .01, "lifted": .01}.get(profile, NOMINAL_FORWARD_MPS)
        self.max_forward_mps = {"fast": .06, "gentle": .025, "lifted": .025}.get(profile, MAX_FORWARD_MPS)
        self.nominal_yaw_radps = math.radians(30) if profile in {"fast", "gentle", "lifted"} else .76
        names = [f"{leg}_{joint}" for leg in LEGS for joint in JOINTS]
        self.actuators = np.array([mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_ACTUATOR, name + "_act")
                                   for name in names], dtype=int)
        if np.any(self.actuators < 0):
            raise ValueError("Missing locomotion actuators")
        joint_ids = model.actuator_trnid[self.actuators, 0]
        self.qpos_addr = model.jnt_qposadr[joint_ids]
        self.qvel_addr = model.jnt_dofadr[joint_ids]
        self.limits = model.jnt_range[joint_ids]

    def period(self, forward_mps, yaw_radps):
        # Nominal speed comes from the measured four-second baseline, not an
        # assumed kinematic stride length. Both commands remain explicit.
        walk_weight = float(np.clip(forward_mps / self.nominal_forward_mps, 0.0, 1.35))
        turn_weight = float(np.clip(abs(yaw_radps) / self.nominal_yaw_radps, 0.0, 1.35))
        total = walk_weight + turn_weight
        period = ((walk_weight * self.walk["period_s"] + turn_weight * self.turn["period_s"]) / total
                  if total > 1e-6 else self.walk["period_s"])
        return period

    def targets(self, time_s, forward_mps, yaw_radps, steering_yaw_radps=0.0):
        walk_weight = float(np.clip(forward_mps / self.nominal_forward_mps, 0.0, 1.35))
        turn_weight = float(np.clip(abs(yaw_radps) / self.nominal_yaw_radps, 0.0, 1.35))
        phase = 2 * math.pi * time_s / self.period(forward_mps, yaw_radps)
        out = np.zeros(18, dtype=np.float64)
        for index, leg in enumerate(LEGS):
            side = -1 if leg[0] == "L" else 1
            walk_sign = {"side": side, "inverse": -side,
                         "same": 1, "negative": -1}[self.walk.get("sign_mode", "side")]
            phi = phase + (0 if leg in TRIPOD_A else math.pi)
            swing = max(0.0, math.sin(phi))
            turn_sign = -math.copysign(1.0, yaw_radps) if yaw_radps else 0.0
            out[3 * index] = (walk_sign * walk_weight * self.walk["yaw_amp"]
                              + turn_sign * turn_weight * self.turn["yaw_amp"]) * math.cos(phi)
            lift = max(walk_weight * self.walk["lift_amp"], turn_weight * self.turn["lift_amp"])
            knee = max(walk_weight * self.walk["knee_amp"], turn_weight * self.turn["knee_amp"])
            out[3 * index + 1] = self.walk.get("stance_pitch_rad", 0.0) - lift * swing
            out[3 * index + 2] = knee * swing if self.profile == "lifted" else -knee * swing
            if forward_mps > 0 and steering_yaw_radps:
                # Differential yaw correction without changing the walking
                # cadence: blending with the slower turn gait stalls walking.
                steering_weight = float(np.clip(abs(steering_yaw_radps) / self.nominal_yaw_radps, 0, 1))
                # With the new radial, same-sign hip gait, differential yaw
                # acts in the opposite direction from the earlier side-sign
                # gait. Keep positive steering equal to positive body yaw.
                steering_sign = (1.0 if self.walk.get("sign_mode") == "same" else -1.0)
                out[3 * index] += (steering_sign * math.copysign(1.0, steering_yaw_radps)
                                   * steering_weight * self.turn["yaw_amp"] * math.cos(phi))
        return self.clip_targets(out)

    def clip_targets(self, values):
        out = np.asarray(values, dtype=np.float64).copy()
        if self.profile == "lifted":
            # Restricted joint envelope checked on the visible FBX foot/shell
            # workspace. The full dynamic trajectory is audited separately.
            for index in range(6):
                out[3 * index] = np.clip(out[3 * index], -.25, .25)
                out[3 * index + 1] = np.clip(out[3 * index + 1], .05, .35)
                out[3 * index + 2] = np.clip(out[3 * index + 2], 0.0, .7)
        return np.clip(out, self.limits[:, 0], self.limits[:, 1])


class VelocityTracker:
    """Small PI feedback around the measured body-frame planar velocity.

    This is a controller, not a learned policy. It adjusts the reference gait's
    effective command while leaving the user's requested command observable.
    """

    def __init__(self, max_forward_mps=MAX_FORWARD_MPS):
        self.max_forward_mps = max_forward_mps
        self.filtered = np.zeros(2, dtype=np.float64)
        self.integral = np.zeros(2, dtype=np.float64)

    def update(self, desired_forward, desired_yaw, measured_forward, measured_yaw, dt=.02):
        desired = np.array((desired_forward, desired_yaw), dtype=np.float64)
        measured = np.array((measured_forward, measured_yaw), dtype=np.float64)
        self.filtered += .10 * (measured - self.filtered)
        error = desired - self.filtered
        active = np.abs(desired) >= np.array((.001 * LENGTH, .05))
        self.integral[active] = np.clip(self.integral[active] + error[active] * dt,
                                        -np.array((min(.5 * self.max_forward_mps, .03), .25))[active],
                                        np.array((min(.5 * self.max_forward_mps, .03), .25))[active])
        self.integral[~active] = 0.0
        corrected = desired + np.array((.6, .6)) * error + np.array((.8, .8)) * self.integral
        corrected[~active] = 0.0
        corrected[0] = np.clip(corrected[0], 0.0, self.max_forward_mps)
        corrected[1] = np.clip(corrected[1], -.9, .9)
        return float(corrected[0]), float(corrected[1])


def recovery_gate(observation):
    """Blend in learned corrections only as measured body tilt grows.

    The observation's projected gravity occupies entries 6:9. This is a
    transparent safety supervisor, not another trained policy.
    """
    gravity_z = float(observation[8])
    tilt_deg = math.degrees(math.acos(float(np.clip(-gravity_z, -1.0, 1.0))))
    return float(np.clip((tilt_deg - 2.0) / 6.0, 0.0, 1.0))


def command_gate(observation):
    """Use learned motion corrections while moving; settle all legs at zero command.

    Standing still can still invoke learned recovery when tilt exceeds 2 deg.
    The normalized forward/yaw command occupies observation entries 71:73.
    """
    moving = abs(float(observation[71])) >= .001 / .012 or abs(float(observation[72])) >= .05 / .9
    return 1.0 if moving else recovery_gate(observation)
