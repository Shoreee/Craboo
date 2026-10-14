# TADA 六足仿真训练

这里保存与网页具身形态对应的 MuJoCo 11 cm 六足模型、交替三足参考步态、残差 PPO 训练代码，以及一份 12 万步的 `lifted` 检查点。训练和评估可独立于网页运行。机器人朝向为机身 `-Y`，六条腿各有三个关节；策略以 50 Hz 输出 18 维关节残差，观测为 74 维。

## 文件

- `mujoco/AsmrDroid_scene.xml` 与 `collision_meshes_crabo/`：训练用动力学场景及 39 个碰撞网格。
- `src/asmrdroid/locomotion/controller.py`：交替三足参考与速度跟踪。
- `src/asmrdroid/locomotion/rl.py`：前进、转向、停止及外力扰动下的 PPO 环境和训练入口。
- `src/asmrdroid/locomotion/evaluate.py`：相同种子和扰动下，对照固定步态与 PPO。
- `outputs/gait_*.json`：参考步态参数；`runs/`：一份与当前场景哈希匹配的检查点和元数据。

## 运行

建议 Python 3.12。先安装依赖，再在此目录执行：

```sh
python -m pip install -r requirements.txt
```

PowerShell：

```powershell
$env:PYTHONPATH = 'src'
python -m asmrdroid.locomotion.rl check --profile lifted
python -m asmrdroid.locomotion.rl train --profile lifted --steps 120000 --envs 4 --tag lifted_new
python -m asmrdroid.locomotion.evaluate --model runs/crabo11_lifted_safe_v1_120000steps.zip --tasks walk turn --pushes none --seeds 3
```

在 macOS/Linux 可用 `PYTHONPATH=src python -m ...` 执行同一命令。训练结果写入 `runs/`；评估结果写入 `outputs/`。已有检查点的元数据包含模型、控制器和参考参数的 SHA-256，评估时会核对，文件变更后需重新训练。

这份 PPO 策略是研究试验：原项目成对验证未显示其在速度跟踪或脚底滑移上优于固定 `lifted` 步态。因此网页采用参考步态参数，并未把该检查点称为当前网页或实体机器人的控制策略。
