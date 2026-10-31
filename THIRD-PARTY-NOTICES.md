# 第三方来源与许可

Better OMP Desktop 是独立项目。主仓库的 MIT 许可证不替代下述组件及依赖的许可证。

## Oh My Pi

来源：https://github.com/can1357/oh-my-pi 。使用版本与提交由 `upstream.lock.json` 记录。`patches/` 修改其运行时，`src/generated/` 保存生成协议和功能清单，`vendor/omp-rpc/` 保存同一基线的 Rust RPC 客户端。运行时包保留 `LICENSE.omp` 和上游 `THIRD-PARTY-NOTICES.txt`，后者覆盖上游发布构建携带的依赖。

MIT License

Copyright (c) 2025 Mario Zechner
Copyright (c) 2025-2026 Can Bölük
Copyright (c) 2026 Stencil Labs, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## oh-my-pi-gui

来源：https://github.com/nornzach/oh-my-pi-gui 。桌面集成参考基线见 `upstream.lock.json` 的 `referenceGui`。`src/lib/settings-zh.ts` 的中文设置文案改编自该项目提交 `0b0127145ea91189cc5fc13f524cc457e1918d16` 的 `schema-zh.ts` 与 `schema-option-zh.ts`，并按当前 OMP 元数据校订。保留原项目许可与归属：

MIT License

Copyright (c) 2026 nornzach

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## 桌面依赖

Tauri、React、xterm、Lucide、TanStack Virtual、react-markdown、Rust crates 及其他依赖按各自包内许可证使用。精确安装输入保存在 `bun.lock` 和 `src-tauri/Cargo.lock`；分发时保留依赖自带的许可文件。上述项目的名称与商标仍属于各自权利人。

## 配置来源图标

发布包中的 Gemini、Antigravity、Claude、Codex、Trae、ZCode 和 CC Switch 图标用于标识配置来源，名称与图标归各自权利人所有。图标由构建步骤从官方站点或官方仓库获取，不纳入本仓库版本控制；具体来源、摘要与归属随包保存于 `agent-icons/manifest.json`。Codex 使用 OpenAI 官方标识。
