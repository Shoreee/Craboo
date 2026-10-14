"""Paired, fixed-seed comparison of the residual policy and fixed tripod gait."""
import argparse
import hashlib
import json
import math
from pathlib import Path

import numpy as np
from stable_baselines3 import PPO

from asmrdroid.common.paths import OUTPUTS
from asmrdroid.common.scale import LENGTH, MASS
from asmrdroid.locomotion.controller import VelocityTracker, recovery_gate, command_gate
from asmrdroid.locomotion.rl import MODEL, LocomotionEnv


COMMANDS = {"walk": (.009 * LENGTH, 0.0), "turn": (0.0, -.65),
            "arc": (.006 * LENGTH, -.30), "stand": (0.0, 0.0)}
PUSHES = {"none": (0.0, 0.0),
          **{f"front_{force * MASS:.2f}N": (0.0, force * MASS)
             for force in (3.0, 4.0, 4.5, 5.0)},
          f"side_{3 * MASS:.2f}N": (3 * MASS, 0.0)}


def check_model(model_path):
    metadata_file = model_path.with_name(model_path.stem + "_metadata.json")
    metadata = json.loads(metadata_file.read_text(encoding="utf-8"))
    current = hashlib.sha256(MODEL.read_bytes()).hexdigest()
    if current != metadata["model_sha256"]:
        raise ValueError("MuJoCo model changed since training; train again")
    controller_hash = hashlib.sha256((MODEL.parents[1] / "src/asmrdroid/locomotion/controller.py").read_bytes()).hexdigest()
    if metadata.get("controller_sha256") != controller_hash:
        raise ValueError("Tripod controller changed since training; train again")
    suffix = metadata.get("profile") if metadata.get("profile") in {"fast", "gentle", "lifted"} else "optimized"
    for name, path in (("walk_reference_sha256", OUTPUTS / f"gait_walk_{suffix}.json"),
                       ("turn_reference_sha256", OUTPUTS / f"gait_turn_{suffix}.json")):
        if hashlib.sha256(path.read_bytes()).hexdigest() != metadata[name]:
            raise ValueError(f"Tripod reference {path.name} changed since training; train again")
    return metadata


def rollout(agent, seed, command, push, residual_rad, push_start, gated=False,
            stop_go_training=False, tracked=False, command_gated=False, profile="standard"):
    env = LocomotionEnv(seed=seed, randomize=False, push_max=0, residual_rad=residual_rad,
                        stop_go_training=stop_go_training, profile=profile)
    obs, _ = env.reset(seed=seed, options={"command": command, "push_vector": push,
                                          "push_start": push_start})
    tracker = VelocityTracker(env.max_forward_mps) if tracked else None
    errors_forward, errors_yaw, slip = [], [], []
    fallen = False
    max_tilt = 0.0
    for step in range(env.max_steps):
        if tracker is not None:
            measured = env._body_velocity()
            env.reference_override = tracker.update(command[0], command[1],
                                                    -float(measured[4]), float(measured[2]))
        action = np.zeros(18, dtype=np.float32) if agent is None else agent.predict(obs, deterministic=True)[0]
        if command_gated:
            action = action * command_gate(obs)
        elif gated:
            action = action * recovery_gate(obs)
        obs, _, terminated, truncated, info = env.step(action)
        errors_forward.append(abs(info["forward_mps"] - command[0]))
        errors_yaw.append(abs(info["yaw_radps"] - command[1]))
        slip.append(info["slip_mps"])
        max_tilt = max(max_tilt, info["tilt_deg"])
        fallen = bool(info["fallen"])
        if terminated or truncated:
            break
    quat = env.data.xquat[env.base]
    yaw = math.degrees(math.atan2(2 * (quat[0] * quat[3] + quat[1] * quat[2]),
                                  1 - 2 * (quat[2] ** 2 + quat[3] ** 2)))
    return {"fallen": fallen, "survived_s": round(env.data.time, 2),
            "max_tilt_deg": round(max_tilt, 3),
            "mean_forward_error_mps": round(float(np.mean(errors_forward)), 5),
            "mean_yaw_error_radps": round(float(np.mean(errors_yaw)), 4),
            "mean_slip_mps": round(float(np.mean(slip)), 5),
            "final_xy_m": [round(float(x), 5) for x in env.data.qpos[:2]],
            "final_yaw_deg": round(yaw, 2)}


def summarize(records, controller):
    vals = [item[controller] for item in records]
    return {"survived": sum(not x["fallen"] for x in vals), "episodes": len(vals),
            "mean_forward_error_mps": round(float(np.mean([x["mean_forward_error_mps"] for x in vals])), 5),
            "mean_yaw_error_radps": round(float(np.mean([x["mean_yaw_error_radps"] for x in vals])), 4),
            "mean_max_tilt_deg": round(float(np.mean([x["max_tilt_deg"] for x in vals])), 3),
            "mean_slip_mps": round(float(np.mean([x["mean_slip_mps"] for x in vals])), 5)}


def main():
    p = argparse.ArgumentParser(description="Compare fixed gait and learned residual on paired pushes")
    p.add_argument("--model", type=Path, required=True)
    p.add_argument("--seeds", type=int, default=5)
    p.add_argument("--tasks", nargs="+", choices=tuple(COMMANDS), default=["walk", "turn", "arc"])
    p.add_argument("--pushes", nargs="+", choices=tuple(PUSHES), default=list(PUSHES))
    args = p.parse_args()
    if args.seeds <= 0:
        p.error("--seeds must be positive")
    metadata = check_model(args.model)
    agent = PPO.load(str(args.model), device="cpu")
    commands = ({"walk": (.05, 0.0), "turn": (0.0, -math.pi / 6),
                 "arc": (.035, -.3), "stand": (0.0, 0.0)}
                if metadata.get("profile") == "fast" else COMMANDS)
    records = []
    for task in args.tasks:
        command = commands[task]
        for push_name in args.pushes:
            push = PUSHES[push_name]
            for seed in range(500, 500 + args.seeds):
                push_start = 45 + 20 * (seed - 500) % 100
                record = {"task": task, "command": command, "push": push_name,
                          "push_xyz_N": (*push, 0.0), "push_start_s": round(push_start * .02, 2),
                          "push_duration_s": .1, "seed": seed,
                          "baseline": rollout(None, seed, command, push, metadata["residual_rad"], push_start,
                                              stop_go_training=metadata.get("stop_go_training", False),
                                              profile=metadata.get("profile", "standard")),
                          "ppo": rollout(agent, seed, command, push, metadata["residual_rad"], push_start,
                                         stop_go_training=metadata.get("stop_go_training", False),
                                         profile=metadata.get("profile", "standard")),
                          "gated_ppo": rollout(agent, seed, command, push, metadata["residual_rad"], push_start,
                                               gated=True, stop_go_training=metadata.get("stop_go_training", False),
                                               profile=metadata.get("profile", "standard")),
                          "tracked": rollout(None, seed, command, push, metadata["residual_rad"], push_start,
                                             stop_go_training=metadata.get("stop_go_training", False), tracked=True,
                                             profile=metadata.get("profile", "standard")),
                          "tracked_ppo": rollout(agent, seed, command, push, metadata["residual_rad"], push_start,
                                                 gated=True, stop_go_training=metadata.get("stop_go_training", False),
                                                 tracked=True, profile=metadata.get("profile", "standard")),
                          "command_gated_ppo": rollout(agent, seed, command, push, metadata["residual_rad"], push_start,
                                                        command_gated=True,
                                                        stop_go_training=metadata.get("stop_go_training", False),
                                                        profile=metadata.get("profile", "standard"))}
                records.append(record)
            case = [x for x in records if x["task"] == task and x["push"] == push_name]
            print(task, push_name,
                  {key: summarize(case, key) for key in ("baseline", "tracked", "ppo", "gated_ppo", "tracked_ppo", "command_gated_ppo")}, flush=True)
    result = {"method": "paired fixed-seed MuJoCo evaluation",
              "checkpoint": str(args.model), "model_sha256": metadata["model_sha256"],
              "seeds": list(range(500, 500 + args.seeds)), "records": records,
              "summary": {key: summarize(records, key) for key in ("baseline", "tracked", "ppo", "gated_ppo", "tracked_ppo", "command_gated_ppo")}}
    OUTPUTS.mkdir(exist_ok=True)
    subset = ("" if args.tasks == ["walk", "turn", "arc"] and args.pushes == list(PUSHES)
              else "_stand" if args.tasks == ["stand"] else "_focused")
    path = OUTPUTS / f"locomotion_eval_{args.model.stem}{subset}.json"
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"EVALUATION={path}", flush=True)


if __name__ == "__main__":
    main()
