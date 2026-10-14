"""One authoritative project root for all task modules."""
from pathlib import Path
ROOT = Path(__file__).resolve().parents[3]
MUJOCO = ROOT / 'mujoco'
OUTPUTS = ROOT / 'outputs'
RUNS = ROOT / 'runs'
CONFIG = ROOT / 'robot_config.json'
