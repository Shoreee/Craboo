"""50 Hz velocity-tracking and fall-avoidance PPO over a tripod reference.

The reference is a conventional gait; PPO controls bounded joint corrections.
The MuJoCo dimensions and actuator limits are provisional, not hardware specs.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import time

import gymnasium as gym
from gymnasium import spaces
import mujoco
import numpy as np
from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import BaseCallback
from stable_baselines3.common.env_checker import check_env
from stable_baselines3.common.vec_env import DummyVecEnv

from asmrdroid.common.paths import MUJOCO, OUTPUTS, ROOT
from asmrdroid.common.scale import LENGTH, MASS, MAX_FORWARD_MPS
from asmrdroid.locomotion.controller import LEGS, TripodReference


MODEL = MUJOCO / "AsmrDroid_scene.xml"
RESIDUAL_RAD = 0.12
CONTROL_DT = 0.02
MAX_STEPS = 200


class LocomotionEnv(gym.Env):
    """Commanded forward speed (+ means body -Y) and yaw speed in rad/s."""

    metadata = {"render_modes": []}

    def __init__(self, seed=0, model_path=MODEL, randomize=True, push_max=4.0 * MASS,
                 push_min=0.0, residual_rad=RESIDUAL_RAD, tilt_penalty=0.0,
                 fall_penalty=10.0, stop_go_training=False, profile="standard"):
        super().__init__()
        self.model = mujoco.MjModel.from_xml_path(str(model_path))
        self.data = mujoco.MjData(self.model)
        self.profile = profile
        self.reference = TripodReference(self.model, profile=profile)
        self.nominal_forward_mps = self.reference.nominal_forward_mps
        self.max_forward_mps = self.reference.max_forward_mps
        self.base = mujoco.mj_name2id(self.model, mujoco.mjtObj.mjOBJ_BODY, "base_link")
        self.body_geom = mujoco.mj_name2id(self.model, mujoco.mjtObj.mjOBJ_GEOM, "body_collision")
        self.spawn_z = float(self.model.qpos0[2])
        mujoco.mj_forward(self.model, self.data)
        self.nominal_body_height = float(self.data.geom_xpos[self.body_geom, 2])
        self.ground = mujoco.mj_name2id(self.model, mujoco.mjtObj.mjOBJ_GEOM, "ground")
        if self.ground < 0:
            self.ground = mujoco.mj_name2id(self.model, mujoco.mjtObj.mjOBJ_GEOM, "bedroom_floor_geom")
        if self.ground < 0:
            raise ValueError("Locomotion scene requires a floor contact geom")
        self.spawn_xy = self.model.qpos0[:2].copy()
        self.feet = np.array([mujoco.mj_name2id(self.model, mujoco.mjtObj.mjOBJ_GEOM,
                                                leg + "_foot_ball_collision") for leg in LEGS])
        self.foot_sites = np.array([mujoco.mj_name2id(self.model, mujoco.mjtObj.mjOBJ_SITE,
                                                     leg + "_foot_center") for leg in LEGS])
        assert self.model.nu == 24 and len(self.feet) == 6 and np.all(self.feet >= 0) and np.all(self.foot_sites >= 0)
        self.original_friction = self.model.geom_friction[self.feet].copy()
        self.original_mass = float(self.model.body_mass[self.base])
        self.randomize = randomize
        self.push_max = push_max
        self.push_min = push_min
        self.residual_rad = residual_rad
        self.tilt_penalty = tilt_penalty
        self.fall_penalty = fall_penalty
        self.stop_go_training = stop_go_training
        self.rng = np.random.default_rng(seed)
        self.action_space = spaces.Box(-1.0, 1.0, shape=(18,), dtype=np.float32)
        self.observation_space = spaces.Box(-np.inf, np.inf, shape=(74,), dtype=np.float32)
        self.prev_action = np.zeros(18, dtype=np.float32)
        self.command = np.zeros(2, dtype=np.float64)
        self.push = np.zeros(2, dtype=np.float64)
        self.push_start = 0
        self.step_count = 0
        self.last_feet_xy = np.zeros((6, 2))
        self.max_tilt_deg = 0.0
        self.max_steps = MAX_STEPS
        self.switch_step = None
        self.next_command = None
        self.reference_override = None
        self.steering_yaw_radps = 0.0
        self.filtered_forward = 0.0
        self.filtered_yaw = 0.0

    def set_command(self, forward_mps, yaw_radps):
        self.command[:] = (float(forward_mps), float(yaw_radps))
        self.reference_override = None
        self.steering_yaw_radps = 0.0

    def _sample_command(self):
        task = int(self.rng.integers(4 if self.stop_go_training else 3))
        if self.profile in {"gentle", "lifted"}:
            if task == 0:
                return (float(self.rng.uniform(.006, .018)), 0.0)
            if task == 1:
                return (0.0, float(self.rng.choice((-1, 1)) * self.rng.uniform(.3, .6)))
            if task == 2:
                return (float(self.rng.uniform(.005, .014)),
                        float(self.rng.choice((-1, 1)) * self.rng.uniform(.15, .35)))
            return (0.0, 0.0)
        if self.profile == "fast":
            if task == 0:
                return (float(self.rng.uniform(.04, .06)), 0.0)
            if task == 1:
                return (0.0, float(self.rng.choice((-1, 1)) * self.rng.uniform(.45, .65)))
            if task == 2:
                return (float(self.rng.uniform(.02, .05)),
                        float(self.rng.choice((-1, 1)) * self.rng.uniform(.2, .45)))
            return (0.0, 0.0)
        if task == 0:
            return (float(self.rng.uniform(.003 * LENGTH, .012 * LENGTH)), 0.0)
        if task == 1:
            return (0.0, float(self.rng.choice((-1, 1)) * self.rng.uniform(.25, .85)))
        if task == 2:
            return (float(self.rng.uniform(.003 * LENGTH, .009 * LENGTH)),
                    float(self.rng.choice((-1, 1)) * self.rng.uniform(.18, .5)))
        return (0.0, 0.0)

    def _standing_command(self):
        return abs(self.command[0]) < .001 * LENGTH and abs(self.command[1]) < .05

    def _body_velocity(self):
        velocity = np.empty(6)
        mujoco.mj_objectVelocity(self.model, self.data, mujoco.mjtObj.mjOBJ_BODY,
                                 self.base, velocity, 1)
        return velocity

    def _contacts(self):
        result = np.zeros(6, dtype=np.float32)
        for contact in self.data.contact:
            for i, foot in enumerate(self.feet):
                if {contact.geom1, contact.geom2} == {self.ground, foot}:
                    result[i] = 1.0
        return result

    def _observe(self):
        rotation = self.data.xmat[self.base].reshape(3, 3)
        gravity = rotation.T @ np.array((0.0, 0.0, -1.0))
        velocity = self._body_velocity()
        phase = 2 * math.pi * self.data.time / self.reference.period(*self.command)
        clock = ((0.0, 0.0) if self.stop_go_training and self._standing_command()
                 else (math.sin(phase), math.cos(phase)))
        height = float(self.data.geom_xpos[self.body_geom, 2])
        obs = np.concatenate((velocity / np.array((1, 1, 1, .05 * LENGTH, .05 * LENGTH, .05 * LENGTH)), gravity,
                              self.data.qpos[self.reference.qpos_addr],
                              self.data.qvel[self.reference.qvel_addr] / 10,
                              self.prev_action, self._contacts(),
                              clock,
                              self.command / np.array((self.max_forward_mps, .9)),
                              ((height - self.nominal_body_height) / (.02 * LENGTH),)))
        return obs.astype(np.float32)

    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)
        options = options or {}
        if seed is not None:
            self.rng = np.random.default_rng(seed)
        self.model.geom_friction[self.feet] = self.original_friction
        self.model.body_mass[self.base] = self.original_mass
        if self.randomize:
            self.model.geom_friction[self.feet, 0] *= self.rng.uniform(.8, 1.2, len(self.feet))
            self.model.body_mass[self.base] *= self.rng.uniform(.9, 1.1)
            mujoco.mj_setConst(self.model, self.data)
        mujoco.mj_resetData(self.model, self.data)
        self.data.qpos[:2] = np.asarray(options.get("initial_xy", self.spawn_xy), dtype=float) + self.rng.uniform(
            -.001 * LENGTH, .001 * LENGTH, 2)
        self.data.qpos[2] = self.spawn_z + self.rng.uniform(.0005 * LENGTH, .002 * LENGTH)
        roll_pitch = self.rng.uniform(-.012, .012, 2)
        perturbation = np.array((math.sqrt(1 - float(np.sum(roll_pitch ** 2))),
                                 roll_pitch[0], roll_pitch[1], 0.0))
        mujoco.mju_mulQuat(self.data.qpos[3:7], self.model.qpos0[3:7], perturbation)
        self.data.qpos[self.reference.qpos_addr] += self.rng.uniform(-.003, .003, 18)
        self.data.qpos[self.reference.qpos_addr] = np.clip(
            self.data.qpos[self.reference.qpos_addr],
            self.reference.limits[:, 0] + 1e-5, self.reference.limits[:, 1] - 1e-5)
        self.data.ctrl[:] = 0
        self.prev_action[:] = 0
        self.step_count = 0
        self.max_tilt_deg = 0.0
        self.filtered_forward = 0.0
        self.filtered_yaw = 0.0
        self.switch_step = None
        self.next_command = None
        self.reference_override = None
        self.steering_yaw_radps = 0.0
        if "command" in options:
            self.command[:] = options["command"]
        else:
            self.command[:] = self._sample_command()
            if self.stop_go_training and self.rng.random() < .65:
                self.switch_step = int(self.rng.integers(50, 150))
                self.next_command = (self._sample_command() if self._standing_command()
                                     else (0.0, 0.0))
        if "switch_step" in options:
            self.switch_step = int(options["switch_step"])
            self.next_command = tuple(options["next_command"])
        self.push_start = int(options.get("push_start", self.rng.integers(35, 150)))
        if "push_vector" in options:
            self.push[:] = options["push_vector"]
        else:
            direction = self.rng.uniform(-math.pi, math.pi)
            force = self.rng.uniform(self.push_min, self.push_max)
            self.push[:] = force * np.array((math.cos(direction), math.sin(direction)))
        mujoco.mj_forward(self.model, self.data)
        self.last_feet_xy = self.data.site_xpos[self.foot_sites, :2].copy()
        return self._observe(), {}

    def step(self, action):
        if self.switch_step is not None and self.step_count == self.switch_step:
            self.command[:] = self.next_command
        action = np.clip(np.asarray(action, dtype=np.float64), -1, 1)
        reference_command = self.command if self.reference_override is None else self.reference_override
        targets = (self.reference.targets(self.data.time, *reference_command,
                                          steering_yaw_radps=self.steering_yaw_radps)
                   + self.residual_rad * action)
        self.data.ctrl[self.reference.actuators] = self.reference.clip_targets(targets)
        self.data.xfrc_applied[self.base, :2] = self.push if self.push_start <= self.step_count < self.push_start + 5 else 0
        for _ in range(10):
            mujoco.mj_step(self.model, self.data)
        self.step_count += 1
        velocity = self._body_velocity()
        forward = -float(velocity[4])
        yaw_rate = float(velocity[2])
        self.filtered_forward += .10 * (forward - self.filtered_forward)
        self.filtered_yaw += .10 * (yaw_rate - self.filtered_yaw)
        rotation = self.data.xmat[self.base].reshape(3, 3)
        upright = float(rotation[2, 2])
        tilt = math.degrees(math.acos(float(np.clip(upright, -1, 1))))
        self.max_tilt_deg = max(self.max_tilt_deg, tilt)
        height = float(self.data.geom_xpos[self.body_geom, 2])
        contacts = self._contacts().astype(bool)
        feet_xy = self.data.site_xpos[self.foot_sites, :2].copy()
        slip = float(np.mean(np.linalg.norm((feet_xy - self.last_feet_xy)[contacts], axis=1) / CONTROL_DT)) if np.any(contacts) else 0.0
        self.last_feet_xy = feet_xy
        forward_tolerance = (.015 if self.profile == "fast" else .005 if self.profile in {"gentle", "lifted"}
                             else .004 * LENGTH)
        if self.stop_go_training:
            # A tripod has oscillating instantaneous velocity. Reward its
            # controlled mean over roughly 0.2 s, at the robot's cm/s scale.
            track_forward = math.exp(-((self.filtered_forward - self.command[0]) / forward_tolerance) ** 2)
            track_yaw = math.exp(-((self.filtered_yaw - self.command[1]) / (.12 if self.profile in {"fast", "gentle", "lifted"} else .30)) ** 2)
        else:
            track_forward = math.exp(-((forward - self.command[0]) / (3 * forward_tolerance)) ** 2)
            track_yaw = math.exp(-((yaw_rate - self.command[1]) / (.25 if self.profile in {"fast", "gentle", "lifted"} else .65)) ** 2)
        standing = self.stop_go_training and self._standing_command()
        joint_speed = float(np.mean(self.data.qvel[self.reference.qvel_addr] ** 2))
        pose_error = float(np.mean(self.data.qpos[self.reference.qpos_addr] ** 2))
        standing_reward = (0.7 * math.exp(-(forward / (.004 * LENGTH)) ** 2)
                           + .5 * math.exp(-(yaw_rate / .2) ** 2)
                           + .2 * float(np.mean(contacts))
                           - .5 * min(joint_speed, 2.0)
                           - .3 * min(pose_error / .01, 2.0)
                           - .25 * float(np.mean(action ** 2))) if standing else 0.0
        reward = (1.7 * track_forward + (3.0 if self.profile in {"fast", "gentle", "lifted"} else 1.2) * track_yaw
                  + 0.6 * max(upright, 0.0)
                  + .2 * math.exp(-((height - self.nominal_body_height) / (.018 * LENGTH)) ** 2)
                  - .02 * float(np.mean(action ** 2))
                  - .03 * float(np.mean((action - self.prev_action) ** 2))
                  - (.12 if self.profile == "fast" else .25 if self.profile in {"gentle", "lifted"} else .4) * max(0.0, slip / LENGTH - .01)
                  - self.tilt_penalty * (tilt / 10.0) ** 2
                  + standing_reward)
        fallen = height < .66 * self.nominal_body_height or tilt > 45
        invalid = not np.isfinite(self.data.qpos).all() or not np.isfinite(self.data.qvel).all()
        terminated = bool(fallen or invalid)
        if terminated:
            reward -= self.fall_penalty
        self.prev_action[:] = action
        return self._observe(), float(reward), terminated, self.step_count >= self.max_steps, {
            "fallen": bool(fallen), "forward_mps": forward, "yaw_radps": yaw_rate,
            "tilt_deg": tilt, "max_tilt_deg": self.max_tilt_deg,
            "slip_mps": slip, "track_forward": track_forward, "track_yaw": track_yaw,
            "standing": bool(standing), "joint_speed_rms": math.sqrt(joint_speed),
            "filtered_forward_mps": self.filtered_forward,
            "filtered_yaw_radps": self.filtered_yaw,
            "push_N": float(np.linalg.norm(self.push)),
        }


class Progress(BaseCallback):
    def __init__(self, path):
        super().__init__()
        self.path = path
        self.next_report = 10000
        self.rewards = []
        self.start = time.monotonic()

    def _on_step(self):
        self.rewards.extend(float(x) for x in self.locals["rewards"])
        if self.num_timesteps >= self.next_report:
            record = {"timesteps": self.num_timesteps,
                      "mean_step_reward": round(float(np.mean(self.rewards)), 4),
                      "elapsed_s": round(time.monotonic() - self.start, 1)}
            with self.path.open("a", encoding="utf-8") as stream:
                stream.write(json.dumps(record) + "\n")
            print("TRAIN_PROGRESS", record, flush=True)
            self.rewards.clear()
            self.next_report += 10000
        return True


def main():
    parser = argparse.ArgumentParser(description="Train residual PPO for commanded hexapod locomotion")
    parser.add_argument("command", choices=("check", "train"))
    parser.add_argument("--steps", type=int, default=120000)
    parser.add_argument("--envs", type=int, default=4)
    parser.add_argument("--tag", default="locomotion_residual_v1")
    parser.add_argument("--push-min", type=float, default=0.0)
    parser.add_argument("--push-max", type=float, default=4.0 * MASS)
    parser.add_argument("--residual-rad", type=float, default=RESIDUAL_RAD)
    parser.add_argument("--tilt-penalty", type=float, default=0.0)
    parser.add_argument("--fall-penalty", type=float, default=10.0)
    parser.add_argument("--stop-go", action="store_true", help="train zero-speed stance and mid-episode stop/go")
    parser.add_argument("--profile", choices=("standard", "fast", "gentle", "lifted"), default="standard")
    args = parser.parse_args()
    if args.command == "check":
        env = LocomotionEnv(seed=42, profile=args.profile)
        check_env(env, warn=True)
        examples = ((.05, 0), (0, -.524), (.03, .3), (0, 0)) if args.profile == "fast" else ((.01, 0), (0, -.524), (.008, .3), (0, 0)) if args.profile in {"gentle", "lifted"} else ((.009, 0), (0, -.7), (.006, .3), (0, 0))
        for command in examples:
            obs, _ = env.reset(seed=42, options={"command": command})
            for _ in range(30):
                obs, reward, terminated, truncated, _ = env.step(np.zeros(18))
                assert np.isfinite(obs).all() and math.isfinite(reward)
                if terminated or truncated:
                    break
        print("PASS: 74D observation, 18D residual action, 50 Hz walk/turn/mixed/stand", flush=True)
        return
    if (args.steps <= 0 or args.envs <= 0 or args.push_min < 0 or args.push_max < args.push_min
            or args.residual_rad <= 0 or args.tilt_penalty < 0 or args.fall_penalty < 0
            or not args.tag.replace("_", "").replace("-", "").isalnum()):
        parser.error("steps/envs must be positive and tag may contain only letters, digits, dash, underscore")
    env = DummyVecEnv([lambda i=i: LocomotionEnv(
        seed=100 + i, push_min=args.push_min, push_max=args.push_max,
        residual_rad=args.residual_rad, tilt_penalty=args.tilt_penalty,
        fall_penalty=args.fall_penalty, stop_go_training=args.stop_go,
        profile=args.profile) for i in range(args.envs)])
    OUTPUTS.mkdir(exist_ok=True)
    runs = ROOT / "runs"
    runs.mkdir(exist_ok=True)
    name = f"{args.tag}_{args.steps}steps"
    agent = PPO("MlpPolicy", env, device="cpu", verbose=0, n_steps=128,
                batch_size=256, n_epochs=4, learning_rate=3e-4, seed=42,
                policy_kwargs={"net_arch": [64, 64], "log_std_init": -1.5})
    agent.learn(total_timesteps=args.steps, callback=Progress(runs / f"{name}_progress.jsonl"))
    model_path = runs / name
    agent.save(str(model_path))
    suffix = args.profile if args.profile in {"fast", "gentle", "lifted"} else "optimized"
    metadata = {"method": "PPO residual on optimized tripod reference",
                "profile": args.profile,
                "nominal_forward_mps": .05 if args.profile == "fast" else .01 if args.profile in {"gentle", "lifted"} else .009 * LENGTH,
                "nominal_yaw_radps": math.radians(30) if args.profile in {"fast", "gentle", "lifted"} else .76,
                "model_sha256": hashlib.sha256(MODEL.read_bytes()).hexdigest(),
                "controller_sha256": hashlib.sha256((ROOT / "src/asmrdroid/locomotion/controller.py").read_bytes()).hexdigest(),
                "walk_reference_sha256": hashlib.sha256((OUTPUTS / f"gait_walk_{suffix}.json").read_bytes()).hexdigest(),
                "turn_reference_sha256": hashlib.sha256((OUTPUTS / f"gait_turn_{suffix}.json").read_bytes()).hexdigest(),
                "steps": args.steps, "envs": args.envs, "seed": 42,
                "observation_dim": 74, "action_dim": 18, "control_hz": 50,
                "residual_rad": args.residual_rad, "push_min_N": args.push_min,
                "push_max_N": args.push_max, "tilt_penalty": args.tilt_penalty,
                "fall_penalty": args.fall_penalty, "stop_go_training": args.stop_go,
                "contract_version": 3 if args.stop_go else 1,
                "checkpoint": str(model_path) + ".zip"}
    (runs / f"{name}_metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print(f"CHECKPOINT={model_path}.zip", flush=True)


if __name__ == "__main__":
    main()
