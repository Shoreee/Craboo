"""Physical scaling from the exported FBX coordinates to the 11 cm prototype."""

import json

from asmrdroid.common.paths import CONFIG


CONFIGURATION = json.loads(CONFIG.read_text(encoding="utf-8"))
# Existing reward and push magnitudes were calibrated on the 11 cm model.
# They remain physical-task tuning constants when the source FBX units change.
LENGTH = float(CONFIGURATION.get("dynamics_reference_scale", CONFIGURATION["source_to_sim_scale"]))
MASS = LENGTH ** 3
HEIGHT_M = float(CONFIGURATION["height_m"])
NOMINAL_FORWARD_MPS = .009 * LENGTH
MAX_FORWARD_MPS = .012 * LENGTH
DEFAULT_PUSH_N = 3.0 * MASS
