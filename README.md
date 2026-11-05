# 手势太阳系

用摄像头控制的 3D 太阳系。**张开手掌**镜头推近、行星放大，**握紧拳头**拉远缩小。手掌左右移动转动视角，上下移动抬高或压低视线。

左右方向可以按 **X** 键翻转（选择会记在 localStorage 里）。3D 环绕相机下近侧和远侧的移动方向天然相反，哪个算"对"取决于你的直觉，所以留了开关。

## 玩

```bash
npm install
npm run dev          # 打开打印出来的地址（摄像头需要 localhost 或 https）
```

构建成静态文件：

```bash
npm run build        # 输出到 dist/
cd dist && python -m http.server 8765 --bind 127.0.0.1
```

点「使用摄像头」并允许权限。没有摄像头或权限被拒，点「用鼠标玩」——按住左键 = 张开，松开 = 握拳，空格切换，M 静音。

## 手势映射

| 你做的 | 发生什么 | 代码位置 |
| --- | --- | --- |
| 张开手掌 | 镜头推近 62 → 38，行星放大，轨道收拢 | `openness` 经 `smoothstep(0.4, 0.86)` 映射 |
| 握紧拳头 | 镜头拉远 38 → 62，行星缩小，轨道展开 | 同上，`openness` 低时归零 |
| 手掌左右移 | 相机绕太阳转动（方位角），X 键翻向 | `targetAz = ±(x - 0.5) * 2.8` |
| 手掌上下移 | 抬高 / 压低视线（俯仰） | `targetPolar`，限幅 0.32–1.55 |
| 手掌倾斜 | 画面轻微 dutch tilt | `roll * 0.25`，限幅 ±0.14 rad |
| 没有手 | 缓慢自转，1.2 秒后回到收拢状态 | `targetAz += dt * 0.1` |

## 技术

- **贴图**：八颗行星 + 太阳 + 土星环 + 银河背景，共 11 张 2k 贴图（约 5MB）。
- **为什么是 2k 不是 8k**：一张 8k equirect 贴图解码后占约 128MB 显存（8192×4096×RGBA），9 张就是 1GB，中端显卡直接爆。而行星在屏幕上通常只有一两百像素宽，2k 的像素密度已经远超屏幕。要更高清，改 `public/textures/` 里的文件并换名字即可。
- **暗面可见**：`MeshStandardMaterial` 加了 `emissiveMap` + `emissiveIntensity: 0.18`，否则背对太阳的行星就是一个纯黑圆盘，认不出贴图。
- **土星环**：`RingGeometry` 默认 UV 是平面映射，纹理会被拉成乱码；重写 UV 为 `(半径 - 内径) / (外径 - 内径)`，纹理才沿半径展开。
- **发光不用 bloom**：太阳的光晕是预渲染的径向渐变 sprite，叠在 `MeshBasicMaterial` 的球体上。
- **行星标签**：每帧把行星世界坐标 `project()` 到 NDC 再换算屏幕坐标，向下偏移量按该行星的屏幕半径算，避免标签压在球体上。
- **比例不是真实的**：真实半径比下木星是水星的 11 倍、轨道差 10 倍以上，照搬会让内行星小到看不见。尺寸和轨道都做了对数压缩。
- **无摄像头测试**：鼠标输入走 `syntheticHand()` 合成手，喂进同一个手势引擎；`shot.mjs` 用 Playwright + 系统 Chrome 无头截图。

## 调参

| 想改什么 | 改哪里 |
| --- | --- |
| 行星大小、轨道半径、公转/自转速度、轴倾角 | `src/scene.ts` 顶部的 `PLANETS` 数组 |
| 太阳大小 | `SUN_R` |
| 镜头远近范围 | `CAM_NEAR` / `CAM_FAR` |
| 张开/握拳的触发点 | `smoothstep(0.4, 0.86, hand.openness)` |
| 旋转灵敏度 | `targetAz = (hand.x - 0.5) * 2.8` 的系数 |
| 暗面亮度 | 材质里的 `emissiveIntensity` |
| 土星环内外径 | `PLANETS` 里土星的 `ring: { inner, outer }` |

## 出处与授权

行星贴图来自 [Solar System Scope](https://www.solarsystemscope.com/textures/)，**CC BY 4.0**，基于 NASA 公开数据制作。页面上保留了署名。

手势引擎、One Euro 滤波、合成手、无头截图工具来自 [abouchedidxcode/open-source-hands](https://github.com/abouchedidxcode/open-source-hands)（MIT）的 `templates/game`。场景、交互和 UI 是重写的。

手部追踪是 Google 的 [MediaPipe](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker)（Apache-2.0），模型为官方发布、未修改。
