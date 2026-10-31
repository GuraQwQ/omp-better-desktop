// 中文文案改编自 oh-my-pi-gui 的 schema-zh.ts 与 schema-option-zh.ts，并按当前 OMP 设置元数据校订。
// Copyright (c) 2026 nornzach；MIT 许可及完整归属见 THIRD-PARTY-NOTICES.md。
export const settingsZh: Record<string, { label: string; description?: string; options?: Record<string, string> }> = {
  "tokenOptimization.skillCacheReuse": {
    "label": "复用技能描述缓存",
    "description": "等待压缩名额后再次检查已完成的技能描述缓存，避免重复调用模型。当前会话的描述保持不变。"
  },
  "tokenOptimization.programmatic": {
    "label": "程序化工具编排",
    "description": "引导代理使用 eval 完成多步确定性处理与批量工具调用，保留错误和原文引用；简单操作仍直接执行。"
  },
  "auth.broker.url": {
    "label": "认证代理 URL"
  },
  "auth.broker.token": {
    "label": "认证代理令牌"
  },
  "auth.accountPolicies": {
    "label": "账号策略"
  },
  "enabledModels": {
    "label": "启用模型白名单"
  },
  "enabledProviders": {
    "label": "启用的能力提供商"
  },
  "disabledProviders": {
    "label": "禁用的提供商"
  },
  "modelRoleStorage": {
    "label": "模型角色存储",
    "description": "模型选择器中角色分配的保存位置",
    "options": {
      "global": "全局",
      "project": "按项目"
    }
  },
  "modelRoles": {
    "label": "模型角色分配"
  },
  "modelPresets": {
    "label": "模型预设"
  },
  "modelTags": {
    "label": "模型标签"
  },
  "modelProviderOrder": {
    "label": "提供商排序"
  },
  "cycleOrder": {
    "label": "快速切换循环"
  },
  "setupVersion": {
    "label": "设置向导版本"
  },
  "autoResume": {
    "label": "自动恢复",
    "description": "自动恢复当前目录中最近的会话"
  },
  "git.enabled": {
    "label": "启用 Git 集成",
    "description": "在 TUI 中显示 git 分支、状态和 PR 信息，并监视仓库元数据。"
  },
  "theme.dark": {
    "label": "深色主题",
    "description": "终端使用深色背景时采用的主题。"
  },
  "theme.light": {
    "label": "浅色主题",
    "description": "终端使用浅色背景时采用的主题。"
  },
  "symbolPreset": {
    "label": "符号预设",
    "description": "图标与符号的字形集（Unicode、Nerd Font 或 ASCII）",
    "options": {
      "unicode": "Unicode",
      "nerd": "Nerd Font",
      "ascii": "ASCII"
    }
  },
  "colorBlindMode": {
    "label": "色盲模式",
    "description": "差异新增行使用蓝色而非绿色"
  },
  "composer.shape": {
    "label": "输入框形态",
    "description": "输入编辑器与状态行的视觉布局。"
  },
  "composer.tokenRate": {
    "label": "生成速率显示",
    "description": "显示实时生成速率（token/秒）：可放在工作状态行的会话标题旁，或原生输入栏的思考等级后；后者会在回合之间保留最近读数。根据流式增量估算，并在每条消息结束时用提供商计费的输出数量校正。"
  },
  "statusLine.preset": {
    "label": "状态预设",
    "description": "预设的状态栏布局。",
    "options": {
      "default": "默认",
      "minimal": "极简",
      "compact": "紧凑",
      "full": "完整",
      "nerd": "Nerd",
      "ascii": "ASCII",
      "custom": "自定义"
    }
  },
  "statusLine.separator": {
    "label": "状态栏分隔符",
    "description": "各分段之间分隔符的样式",
    "options": {
      "powerline": "Powerline",
      "powerline-thin": "细尖括号",
      "slash": "斜杠",
      "pipe": "竖线",
      "block": "方块",
      "none": "无",
      "ascii": "ASCII"
    }
  },
  "statusLine.contextLine": {
    "label": "上下文响应线",
    "description": "左右分段之间的横线如何表示上下文用量（仅适用于方框式输入框）。",
    "options": {
      "off": "关闭",
      "percentage": "百分比",
      "annotated": "带阈值标记",
      "embedded": "内嵌上下文信息"
    }
  },
  "statusLine.sessionAccent": {
    "label": "会话强调色",
    "description": "将会话名称的颜色用于编辑器边框和状态栏间隙"
  },
  "statusLine.transparent": {
    "label": "透明状态栏",
    "description": "状态栏使用终端默认背景而非主题的 `statusLineBg`。Powerline 端帽会被丢弃，因为它们需要对比色填充来过渡到周围的终端区域。"
  },
  "statusLine.compactThinkingLevel": {
    "label": "紧凑思考等级",
    "description": "在模型名称上用单个图标显示思考等级，取代单独的 ` · <level>` 后缀；Tern 输入框中则使用模型标签的图标，点击图标可切换等级。"
  },
  "statusLine.showHookStatus": {
    "label": "显示钩子状态",
    "description": "在状态栏下方显示钩子状态消息"
  },
  "statusLine.leftSegments": {
    "label": "状态栏左侧分段"
  },
  "statusLine.rightSegments": {
    "label": "状态栏右侧分段"
  },
  "statusLine.segmentOptions": {
    "label": "状态栏分段选项"
  },
  "terminal.showImages": {
    "label": "显示内联图片",
    "description": "在终端中内联渲染图片"
  },
  "images.autoResize": {
    "label": "自动缩放图片",
    "description": "将大图缩放至最大 2000x2000，以获得更好的模型兼容性"
  },
  "images.blockImages": {
    "label": "屏蔽图片",
    "description": "阻止图片发送给 LLM 提供商"
  },
  "tui.maxInlineImageColumns": {
    "label": "内联图片列宽上限"
  },
  "tui.maxInlineImageRows": {
    "label": "内联图片行高上限"
  },
  "tui.maxInlineImages": {
    "label": "内联图片数量上限"
  },
  "tui.resizeScrollback": {
    "label": "重排回滚区",
    "description": "终端尺寸稳定后，如何刷新保留在终端回滚区中的对话行。",
    "options": {
      "append": "追加",
      "rebuild": "重建",
      "preserve": "保留原宽度"
    }
  },
  "tui.completeScrollback": {
    "label": "完整保留回滚历史",
    "description": "HUD 或对话框增大时，将挤出屏幕的对话行直接送入终端回滚区；缩小时，对话与输入框之间会保留空行，直到新输出将其填满。"
  },
  "terminal.showProgress": {
    "label": "原生运行进度",
    "description": "Agent 或上下文维护运行时，通过 OSC 9;4 发送不定进度信号（Tern 中始终开启）。"
  },
  "terminal.programStatus": {
    "label": "程序状态（OSC 7501）",
    "description": "通过 OSC 7501 报告 Agent 正在工作、等待你输入、已完成或失败的状态，供终端标签指示器和 Agent 收件箱使用。"
  },
  "tui.textSizing": {
    "label": "大标题（Kitty）",
    "description": "使用 Kitty 的 OSC 66 文本尺寸协议将 Markdown H1 标题以 2 倍缩放渲染。仅在 Kitty 终端上生效，其他终端忽略。默认关闭。"
  },
  "tui.renderMermaid": {
    "label": "渲染 Mermaid 图表",
    "description": "将 Mermaid 围栏代码块渲染为 ASCII 图示。"
  },
  "tui.renderSvg": {
    "label": "渲染 SVG 图形",
    "description": "提示 Agent 使用 SVG 绘制图示和图表，并在支持图形的终端中将其作为图片内联显示。"
  },
  "tui.autoGraph": {
    "label": "表格自动绘图",
    "description": "在支持图形的终端中，使用当前主题配色在 Agent 回复的数值表格下方绘制图表。",
    "options": {
      "smart": "智能",
      "always": "始终",
      "off": "关闭"
    }
  },
  "tui.reactions": {
    "label": "Agent 表情回应",
    "description": "允许 Agent 在回复气泡上用表情徽章回应你的消息"
  },
  "tui.codexResetFireworks": {
    "label": "Codex 重置烟花",
    "description": "当 Codex 每周用量意外重置或有新存入的保存重置时，在屏幕顶部三分之一处放烟花庆祝，直到按 Escape"
  },
  "tui.titleState": {
    "label": "标题运行状态",
    "description": "在终端标题的分隔符中显示 Agent 状态：工作时显示旋转动画（WSL 下为静态冒号 :），轮到你时显示 >，等待你输入时显示 !。"
  },
  "tui.titleSpinner": {
    "label": "终端标题旋转符",
    "description": "终端标题中工作状态旋转符的字形集：盲文扫动、月相填充、单点循环或兼容 ASCII 的线条。",
    "options": {
      "braille": "盲文",
      "pulse": "脉冲",
      "dots": "圆点",
      "line": "线条"
    }
  },
  "tui.hyperlinks": {
    "label": "终端超链接",
    "description": "将路径和 URL 包裹为 OSC 8 超链接，以便终端原生点击打开（auto：检测支持；off：从不；always：无条件）",
    "options": {
      "off": "关闭",
      "auto": "自动",
      "always": "始终"
    }
  },
  "tui.mouse": {
    "label": "鼠标点击聚焦",
    "description": "在主会话中捕获鼠标点击，以便点击聚焦实时子代理卡片和 HUD 行，并高亮悬停目标。开启后，原生文本选择需按 Shift 拖动，滚轮滚动需按 Shift。"
  },
  "tui.tight": {
    "label": "紧凑界面密度",
    "description": "移除终端输出左右各 1 个字符的水平留白。"
  },
  "display.shimmer": {
    "label": "微光动画",
    "description": "工作/加载消息的动画样式",
    "options": {
      "classic": "经典",
      "kitt": "KITT 扫描器",
      "disabled": "已禁用"
    }
  },
  "display.pinnedAgents": {
    "label": "固定代理列表",
    "description": "编辑器上方的活动代理快捷列表：off 隐藏；collapsed 显示少量行并可展开；full 显示全部。",
    "options": {
      "off": "关闭",
      "collapsed": "折叠",
      "full": "完整"
    }
  },
  "display.subagentLivePreview": {
    "label": "子代理实时预览",
    "description": "在每个固定子代理的行下方显示其当前或最近一次工具调用。"
  },
  "display.smoothStreaming": {
    "label": "平滑流式输出",
    "description": "在数据块到达时平滑地展现助手文本和流式工具输入"
  },
  "display.hideToolActivity": {
    "label": "隐藏工具活动",
    "description": "在转录中隐藏模型发起的工具调用及其结果"
  },
  "display.showTokenUsage": {
    "label": "显示 Token 用量",
    "description": "在助手消息上显示每轮 token 用量"
  },
  "display.showTurnTime": {
    "label": "显示回合耗时",
    "description": "在助手消息的用量行显示从提示到产出的总耗时（含工具调用）。"
  },
  "display.cacheMissMarker": {
    "label": "缓存未命中标记",
    "description": "助手某轮请求未命中提示词缓存时，在该轮回复后显示分隔线。"
  },
  "display.collapseCompacted": {
    "label": "折叠已压缩历史",
    "description": "在实时转录中把压缩前的历史折叠到摘要分隔线之后；禁用则保留完整转录，并在每个压缩点显示分隔线"
  },
  "showHardwareCursor": {
    "label": "显示硬件光标",
    "description": "显示终端光标以支持输入法（IME）"
  },
  "tui.imeSafeCursor": {
    "label": "输入法安全的提示符布局",
    "description": "把提示符底边框移到单独一行，避免 macOS 输入法预编辑文本使其移位"
  },
  "steeringMode": {
    "label": "引导模式",
    "description": "Agent 工作时如何处理排队的消息",
    "options": {
      "all": "全部",
      "one-at-a-time": "逐个"
    }
  },
  "followUpMode": {
    "label": "跟进模式",
    "description": "一轮结束后如何依次处理跟进消息。",
    "options": {
      "all": "全部",
      "one-at-a-time": "逐个"
    }
  },
  "interruptMode": {
    "label": "中断模式",
    "description": "引导消息何时中断工具执行",
    "options": {
      "immediate": "立即",
      "wait": "等待"
    }
  },
  "tui.vimMode": {
    "label": "Vim 编辑模式",
    "description": "使用 Vim 模态编辑提示词。Esc 退出插入模式；普通模式支持 hjkl、0、$、^、w、b、e、gg、G、计数、x/D/C、dd/yy、p 和 u；操作符可配合移动或文本对象（diw、ca(、dap）；v/V 开始可视选择，y 复制、d 删除。"
  },
  "tui.vimModeDisplay": {
    "label": "Vim 模式指示",
    "description": "当前 Vim 模式在状态栏中的显示方式。",
    "options": {
      "text": "文本",
      "icon": "图标",
      "none": "隐藏"
    }
  },
  "loop.mode": {
    "label": "循环模式",
    "description": "/loop 迭代之间、重新提交提示词之前执行什么操作",
    "options": {
      "prompt": "提示词",
      "compact": "紧凑",
      "reset": "重置"
    }
  },
  "loop.conditionTimeoutMs": {
    "label": "循环条件超时（毫秒）",
    "description": "等待 `/loop --while` 或 `--until` 条件命令的最长时间（毫秒）；超时后视为条件异常并停止循环。0 表示无限等待。",
    "options": {
      "0": "无限制",
      "10000": "10 秒",
      "30000": "30 秒",
      "120000": "2 分钟"
    }
  },
  "composer.recallClearedDrafts": {
    "label": "召回已清空的草稿",
    "description": "将用 Ctrl+C 清空的草稿保留在本地 ↑/↓ 历史中，直到退出；关闭后仅影响此后清空的草稿。"
  },
  "doubleEscapeAction": {
    "label": "双击 Escape 动作",
    "description": "编辑器为空时连续按两次 Escape 触发的动作",
    "options": {
      "rewind": "回退选择器",
      "tree": "会话树",
      "none": "无"
    }
  },
  "input.bareExitOnEmptySession": {
    "label": "空会话直接退出",
    "description": "发送首条消息前，提交完整的 exit、quit 或 q（不区分大小写）会退出，而不向模型发送提示。"
  },
  "input.bareSlashCommands": {
    "label": "省略命令前导斜杠",
    "description": "仅提交命令名、不带前导 /（如 model、compact）时执行对应斜杠命令；会话已有消息后，需按两次 Enter 确认。"
  },
  "treeFilterMode": {
    "label": "会话树过滤",
    "description": "打开会话树时的默认过滤模式",
    "options": {
      "default": "默认",
      "no-tools": "无工具",
      "user-only": "仅用户",
      "labeled-only": "仅带标签",
      "all": "全部"
    }
  },
  "autocompleteMaxVisible": {
    "label": "自动补全条目数",
    "description": "自动补全下拉框中最大可见条目数（3-20）",
    "options": {
      "3": "3 项",
      "5": "5 项",
      "7": "7 项",
      "10": "10 项",
      "15": "15 项",
      "20": "20 项"
    }
  },
  "spelling.typoDetection": {
    "label": "拼写错误检测（macOS）",
    "description": "用当前 macOS 词典标记提示词中的拼写错误。"
  },
  "spelling.autocomplete": {
    "label": "单词自动补全",
    "description": "以行内提示显示预测的单词补全：按 Tab 接受并添加空格，按 → 接受但不添加空格。",
    "options": {
      "off": "关闭",
      "auto": "自动",
      "ngram": "N-gram 词频预测",
      "smollm": "SmolLM 本地模型"
    }
  },
  "composer.predictions": {
    "label": "预测下一条消息",
    "description": "每轮完成后，请当前模型预测你的下一条消息，并在空输入框中显示为浅色提示；按 Tab 或 → 插入，暂不发送。额外用量：每轮完成后都会基于完整对话新增一次计费请求，计入 /stats。"
  },
  "spelling.autocorrect": {
    "label": "自动更正（macOS）",
    "description": "对已完成的词应用有把握的 macOS 拼写更正。"
  },
  "emojiAutocomplete": {
    "label": "Emoji 自动补全",
    "description": "根据 `:name:` 短代码建议 emoji，并展开 `:D` 或 `:-)` 之类的文本表情"
  },
  "paste.largeMenuThreshold": {
    "label": "大段粘贴菜单",
    "description": "当粘贴达到此行数时，提供菜单将其包裹为代码块、包裹进 XML 标签或保存为文件。0 表示禁用该菜单（大段粘贴仍会折叠为 [Paste] 标记）。",
    "options": {
      "0": "关闭",
      "100": "100 行",
      "250": "250 行",
      "500": "500 行",
      "1000": "1000 行"
    }
  },
  "startup.quiet": {
    "label": "静默启动",
    "description": "跳过欢迎界面和启动状态消息"
  },
  "startup.showSplash": {
    "label": "显示启动画面",
    "description": "正常交互式启动时显示完整的动画设置画面，而不重新运行设置。静默启动仍会抑制它。"
  },
  "startup.setupWizard": {
    "label": "设置向导",
    "description": "每个设置版本展示一次新增的入门引导步骤"
  },
  "startup.checkUpdate": {
    "label": "检查更新",
    "description": "启动时检查 omp 更新"
  },
  "update.channel": {
    "label": "OMP 更新通道",
    "description": "omp update 与启动更新检查使用的更新通道。",
    "options": {
      "stable": "稳定版",
      "canary": "预览版"
    }
  },
  "marketplace.autoUpdate": {
    "label": "插件市场自动更新",
    "description": "启动时检查插件更新",
    "options": {
      "off": "关闭",
      "notify": "通知",
      "auto": "自动"
    }
  },
  "startup.changelogMode": {
    "label": "启动更新日志",
    "description": "选择更新说明以摘要、完整详情开始，或保持隐藏",
    "options": {
      "summary": "摘要",
      "expanded": "展开",
      "hidden": "隐藏"
    }
  },
  "magicKeywords.enabled": {
    "label": "魔法关键词",
    "description": "为独立的 ultrathink、orchestrate、workflowz 和 jevify 关键词启用隐藏提示"
  },
  "magicKeywords.ultrathink": {
    "label": "Ultrathink 关键词",
    "description": "允许独立的 ultrathink 请求最大自动思考并附加其隐藏提示"
  },
  "magicKeywords.orchestrate": {
    "label": "Orchestrate 关键词",
    "description": "允许独立的 orchestrate 附加其隐藏的多代理编排提示"
  },
  "magicKeywords.workflow": {
    "label": "Workflow 关键词",
    "description": "允许独立的 workflowz 附加其隐藏的 eval 工作流提示"
  },
  "magicKeywords.jevify": {
    "label": "Jevify 关键词",
    "description": "允许独立的 jevify 附加其隐藏的批量 judge 分类提示"
  },
  "completion.notify": {
    "label": "完成通知",
    "description": "Agent 完成一轮时通知",
    "options": {
      "on": "开启",
      "off": "关闭"
    }
  },
  "error.notify": {
    "label": "错误通知",
    "description": "Agent 因错误停止时通知",
    "options": {
      "on": "开启",
      "off": "关闭"
    }
  },
  "ask.timeout": {
    "label": "询问超时",
    "description": "经过此秒数后自动选择推荐的提问选项（0 表示禁用）。也限制 cfg:// 审批提示的等待时间；审批未获答复时拒绝写入，不会自动选择。",
    "options": {
      "0": "已禁用",
      "15": "15 秒",
      "30": "30 秒",
      "60": "60 秒",
      "120": "120 秒"
    }
  },
  "ask.notify": {
    "label": "询问通知",
    "description": "ask 工具等待输入时通知",
    "options": {
      "on": "开启",
      "off": "关闭"
    }
  },
  "recap.enabled": {
    "label": "空闲回顾",
    "description": "终端空闲一段时间后，生成一段简短的 LLM 回顾说明当前进展"
  },
  "recap.idleSeconds": {
    "label": "空闲回顾延迟",
    "description": "空闲等待多少秒后显示回顾",
    "options": {
      "60": "1 分钟",
      "120": "2 分钟",
      "240": "4 分钟",
      "300": "5 分钟",
      "600": "10 分钟"
    }
  },
  "power.sleepPrevention": {
    "label": "防止睡眠",
    "description": "在活动会话期间防止 macOS 睡眠。每个等级是累积的——它会叠加所有更低等级的标志。",
    "options": {
      "off": "关闭",
      "idle": "阻止空闲休眠",
      "display": "阻止显示器休眠",
      "system": "阻止系统休眠"
    }
  },
  "prewalk.enabled": {
    "label": "启用 Prewalk",
    "description": "先以当前模型开始，在计划提示的待办列表生成后、首次编辑/写入时切换到快速/便宜的模型（默认 'smol' 角色）——强模型负责规划、提交待办并开始实现，然后交接。可用 --prewalk / --no-prewalk 按会话覆盖。"
  },
  "prewalk.auto": {
    "label": "自动 Prewalk",
    "description": "通过 'judge' 角色解析出的原生判定模型，判断每个新的顶层用户任务是否把困难推理集中在前期。需要原生判定模型；没有时不做分类。与“启用 Prewalk”相互独立。",
    "options": {
      "off": "关闭",
      "suggest": "建议",
      "on": "开启"
    }
  },
  "prewalk.autoTarget": {
    "label": "自动 Prewalk 目标",
    "description": "自动 Prewalk 在首次编辑/写入时交接到的模型或角色（默认 '@smol'）。"
  },
  "providers.maxInFlightRequests": {
    "label": "最大并发请求数",
    "description": "每个提供商 id 的最大并发 LLM 请求数（例如 \"openai\" 或 \"anthropic\"），在使用此配置根目录的本地 OMP 进程间共享。未列出的提供商不受限制。"
  },
  "images.describeForTextModels": {
    "label": "为纯文本模型描述图片",
    "description": "当图片附加到不支持视觉的模型时，将其保存到 local:// 下，并注入来自视觉模型的描述，而不是丢弃"
  },
  "defaultThinkingLevel": {
    "label": "思考等级",
    "description": "支持思考的模型的推理深度",
    "options": {
      "auto": "自动",
      "minimal": "最低",
      "low": "低",
      "medium": "中",
      "high": "高",
      "xhigh": "极高",
      "max": "最高"
    }
  },
  "hideThinkingBlock": {
    "label": "隐藏思考块",
    "description": "在助手回复中隐藏思考块"
  },
  "expandThinkingBlocks": {
    "label": "展开已完成的思考块",
    "description": "回合结束后保持已完成的思考块展开。"
  },
  "proseOnlyThinking": {
    "label": "思考摘要仅保留文本",
    "description": "从思考摘要中省略代码块，并以省略号替代"
  },
  "omitThinking": {
    "label": "省略思考摘要",
    "description": "指示上游提供商在回复中完全省略思考摘要（在支持的情况下）"
  },
  "externalThinking": {
    "label": "外部思考",
    "description": "使用不向用户展示的私有草稿区，并关闭受支持的 GPT、Claude 和 Gemini 模型推理。"
  },
  "model.loopGuard.enabled": {
    "label": "循环守卫",
    "description": "为模型推理和散文输出启用自动流式循环检测"
  },
  "model.loopGuard.checkAssistantContent": {
    "label": "循环检测包含回复正文",
    "description": "除思考日志外，还对助手散文消息应用循环守卫"
  },
  "model.loopGuard.toolCallReminder": {
    "label": "循环守卫工具调用提醒",
    "description": "当 Gemini 推理流连续输出多个规划标题却不调用工具时，中断它并注入一条要求发起工具调用的提醒（需启用循环守卫）"
  },
  "model.toolCallLoopGuard.enabled": {
    "label": "工具调用循环守卫",
    "description": "检测跨轮次的连续相同工具调用，并注入纠正性引导"
  },
  "model.toolCallLoopGuard.threshold": {
    "label": "工具调用循环阈值",
    "description": "注入纠正性引导所需的连续相同工具调用次数"
  },
  "model.toolCallLoopGuard.exemptTools": {
    "label": "循环豁免工具",
    "description": "允许连续重复而不触发跨轮循环守卫的工具名称"
  },
  "inlineToolDescriptors": {
    "label": "内联工具描述符",
    "description": "在系统提示词中渲染完整的工具描述符，并从提供商工具 schema 中剥离顶层/嵌套描述，使描述文本只发送一次。Auto 对 Gemini 模型启用，其他模型禁用",
    "options": {
      "auto": "自动",
      "on": "开启",
      "off": "关闭"
    }
  },
  "includeModelInPrompt": {
    "label": "在提示词中包含模型",
    "description": "在系统提示词中暴露当前模型标识符，让 Agent 知道自己使用的是哪个模型"
  },
  "includeWorkspaceTree": {
    "label": "包含工作区目录树",
    "description": "在系统提示词中渲染工作区目录树。警告：文件修改时可能破坏跨会话的提示词缓存。"
  },
  "skillful": {
    "label": "在提示词中列出技能",
    "description": "在系统提示词中列出可用技能；关闭可节省上下文，并可用 /skillful 按会话切换"
  },
  "personality": {
    "label": "性格",
    "description": "渲染到系统提示词性格块中的沟通风格",
    "options": {
      "default": "默认",
      "friendly": "友好",
      "pragmatic": "务实",
      "none": "无"
    }
  },
  "temperature": {
    "label": "温度",
    "description": "采样温度（0 = 确定性，1 = 创造性，-1 = 提供商默认）",
    "options": {
      "0": "0",
      "1": "1",
      "-1": "默认",
      "0.2": "0.2",
      "0.5": "0.5",
      "0.7": "0.7"
    }
  },
  "topP": {
    "label": "核采样阈值（Top P）",
    "description": "核采样截断（0-1，-1 = 提供商默认）",
    "options": {
      "1": "1",
      "-1": "默认",
      "0.1": "0.1",
      "0.3": "0.3",
      "0.5": "0.5",
      "0.9": "0.9"
    }
  },
  "topK": {
    "label": "候选数量（Top K）",
    "description": "从概率最高的 K 个 token 中采样（-1 = 提供商默认）",
    "options": {
      "1": "1",
      "20": "20",
      "40": "40",
      "100": "100",
      "-1": "默认"
    }
  },
  "minP": {
    "label": "最小概率（Min P）",
    "description": "最小概率阈值（0-1，-1 = 提供商默认）",
    "options": {
      "-1": "默认",
      "0.01": "0.01",
      "0.05": "0.05",
      "0.1": "0.1"
    }
  },
  "presencePenalty": {
    "label": "存在惩罚",
    "description": "对引入已出现 token 的惩罚（-1 = 提供商默认）",
    "options": {
      "0": "0",
      "1": "1",
      "2": "2",
      "-1": "默认",
      "0.5": "0.5"
    }
  },
  "repetitionPenalty": {
    "label": "重复惩罚",
    "description": "对重复 token 的惩罚（-1 = 提供商默认）",
    "options": {
      "1": "1",
      "-1": "默认",
      "0.8": "0.8",
      "1.1": "1.1",
      "1.2": "1.2",
      "1.5": "1.5"
    }
  },
  "textVerbosity": {
    "label": "文本详细度",
    "description": "OpenAI Responses 与 Codex 的回复详细度（low、medium 或 high）",
    "options": {
      "low": "低",
      "medium": "中",
      "high": "高"
    }
  },
  "tier.openai": {
    "label": "服务等级 — OpenAI",
    "description": "OpenAI / OpenAI-Codex 请求以及经 OpenRouter 路由的 OpenAI 系模型的处理等级（none = 不发送）。以 `service_tier` 发送。",
    "options": {
      "none": "无",
      "auto": "自动",
      "default": "默认",
      "flex": "Flex",
      "scale": "Scale",
      "priority": "优先",
      "ultrafast": "超快"
    }
  },
  "tier.anthropic": {
    "label": "服务等级 — Anthropic",
    "description": "Claude 请求的处理等级。`priority` 在支持的 Anthropic 直连模型上实现快速模式（`speed: \"fast\"`）；在 Bedrock/Vertex Claude 及经 OpenRouter 时忽略。",
    "options": {
      "none": "无",
      "priority": "优先"
    }
  },
  "tier.google": {
    "label": "服务等级 — Google",
    "description": "Gemini（Google AI Studio + Vertex）请求以及经 OpenRouter 路由的 Google 系模型的处理等级（none = 不发送）。以顶层 `serviceTier` 字段发送。",
    "options": {
      "none": "无",
      "flex": "Flex",
      "priority": "优先"
    }
  },
  "tier.subagent": {
    "label": "服务等级 — 子代理",
    "description": "派生的 task/eval 子代理的服务等级。Inherit = 跟随主 Agent 当前的按厂商等级（随 /fast 变化）；选择具体值则应用于子代理模型所属的厂商。",
    "options": {
      "inherit": "继承",
      "none": "无",
      "auto": "自动",
      "default": "默认",
      "flex": "Flex",
      "scale": "Scale",
      "priority": "优先",
      "ultrafast": "超快"
    }
  },
  "tier.advisor": {
    "label": "服务等级 — 顾问",
    "description": "顾问模型的服务等级。None = 标准处理；Inherit = 跟随主 Agent 当前的按厂商等级；选择具体值则应用于顾问模型所属的厂商。",
    "options": {
      "inherit": "继承",
      "none": "无",
      "auto": "自动",
      "default": "默认",
      "flex": "Flex",
      "scale": "Scale",
      "priority": "优先",
      "ultrafast": "超快"
    }
  },
  "retry.enabled": {
    "label": "启用重试"
  },
  "retry.maxRetries": {
    "label": "重试次数",
    "description": "API 出错时的最大重试次数",
    "options": {
      "1": "重试 1 次",
      "2": "重试 2 次",
      "3": "重试 3 次",
      "5": "重试 5 次",
      "10": "重试 10 次"
    }
  },
  "retry.baseDelayMs": {
    "label": "重试基础延迟"
  },
  "retry.maxDelayMs": {
    "label": "最大重试延迟",
    "description": "重试之间的最长等待时间（毫秒）。提供商要求的等待超过此值，且没有凭据或模型回退成功时，请求会直接失败（如 Anthropic 的 3 小时限流窗口）。0 表示取消上限，允许会话等待提供商声明的额度重置后自动恢复。"
  },
  "retry.waitForUsageReset": {
    "label": "等待额度重置",
    "description": "提供商报告额度耗尽并给出重置时间（如 5 小时或每周窗口）时，等待重置，即使超过 retry.maxDelayMs。可按 Esc 中止；等待也会阻塞子代理，因此无人值守运行时应关闭。"
  },
  "retry.modelFallback": {
    "label": "重试模型回退",
    "description": "提供商出错后，允许恢复重试时切换到 retry.fallbackChains 中的模型；此项与自动提升上下文相互独立。"
  },
  "retry.fallbackOn": {
    "label": "回退触发条件",
    "description": "哪些失败请求可以切换到已配置的回退模型",
    "options": {
      "any": "任意错误",
      "usage-limit": "仅用量限制",
      "except-usage-limit": "除用量限制外"
    }
  },
  "retry.usageAwareFallback": {
    "label": "用量感知回退",
    "description": "利用可靠的编程套餐额度报告，在硬性用量限制前优先选择同提供商账户，其次是配置的回退模型。普通配置的 API 密钥不参与。"
  },
  "retry.usageReservePct": {
    "label": "预留余量",
    "description": "剩余额度低于此百分比时，将编程套餐模型视为接近上限。用量未知或未映射时保持主模型。",
    "options": {
      "5": "5%",
      "10": "10%",
      "15": "15%",
      "20": "20%",
      "25": "25%"
    }
  },
  "retry.usageReservePolicy": {
    "label": "预留策略",
    "description": "当所有同提供商编程套餐账户都进入预留余量时的处理方式。",
    "options": {
      "confirm": "交互式确认",
      "auto": "自动回退",
      "fail-closed": "失败时拒绝"
    }
  },
  "retry.fallbackChains": {
    "label": "重试回退链",
    "description": "将模型角色、模型选择器（provider/model-id）或提供商通配符（provider/*）映射为有序回退选择器的 JSON 对象，例如 {\"default\":[\"openai/gpt-4o-mini\"],\"google-antigravity/*\":[\"google/*\",\"google-vertex/*\"]}。模型或提供商键在其激活时生效，与角色无关；provider/* 条目保留失败模型的 ID 并更换提供商。带 ID 前缀的通配符（openrouter/google/*）会为失败模型的裸 ID 重新添加前缀（google-antigravity/gemini-x → openrouter/google/gemini-x）；用作键时，仅匹配该提供商在此前缀下的 ID。回退条目可显式携带思考后缀（provider/model:low、:high、:max、:off）；无后缀时继承失败轮次的推理强度，provider/* 条目始终继承。"
  },
  "retry.fallbackRevertPolicy": {
    "label": "回退恢复策略",
    "description": "回退之后何时返回主模型",
    "options": {
      "cooldown-expiry": "冷却期结束",
      "never": "从不"
    }
  },
  "providers.anthropic.serverSideFallback": {
    "label": "Anthropic 服务端回退（Fable 5）",
    "description": "Claude Fable 5 / Mythos 5 请求被 Anthropic 安全分类器拦截时，在服务端改用 Claude Opus 5 重试（Anthropic `server-side-fallback-2026-06-01` beta）。需手动开启；关闭时所有请求保持原有处理方式。"
  },
  "providers.anthropic.slowMode": {
    "label": "Anthropic 慢速模式",
    "options": {
      "off": "关闭",
      "auto": "自动"
    }
  },
  "providers.ollama-cloud.maxConcurrency": {
    "label": "Ollama Cloud 最大并发",
    "description": "每个进程的 Ollama Cloud 子代理并发运行上限；0 表示禁用该提供商专属限制"
  },
  "providers.webSearchTimeoutSeconds": {
    "label": "网络搜索超时",
    "description": "每个提供商的搜索传输硬超时；超时后 web_search 会尝试下一个回退项，单位为秒（最大 300）",
    "options": {
      "30": "30 秒",
      "60": "1 分钟",
      "120": "2 分钟",
      "180": "3 分钟",
      "300": "5 分钟"
    }
  },
  "providers.antigravityEndpoint": {
    "label": "Antigravity 端点模式",
    "description": "google-antigravity 提供商的端点路由策略（chat、search、image、discovery）",
    "options": {
      "auto": "自动",
      "production": "仅生产环境",
      "sandbox": "仅沙盒环境"
    }
  },
  "providers.fireworksTier": {
    "label": "Fireworks 等级",
    "description": "Fireworks 请求的服务路径。优先模式发送 `service_tier: \"priority\"`，以更高费用换取高峰期更可靠的服务；标准模式不发送该字段。Fast（`-fast`）模型使用独立服务路径，忽略此设置。",
    "options": {
      "standard": "标准",
      "priority": "优先"
    }
  },
  "providers.tinyModelDevice": {
    "label": "微型模型设备",
    "description": "本地微型模型（标题与记忆）的推理后端：可选择 ONNX 执行提供商，或选择 mlx 下载 MLX 权重并通过 mlx-lm 在 Apple Silicon 上运行。默认仅使用 CPU 的 ONNX。PI_TINY_DEVICE 环境变量可覆盖此项。",
    "options": {
      "default": "默认",
      "gpu": "GPU",
      "cpu": "CPU",
      "mlx": "MLX",
      "metal": "Metal",
      "webgpu": "WebGPU",
      "cuda": "CUDA",
      "dml": "DirectML",
      "coreml": "CoreML",
      "auto": "自动",
      "wasm": "WASM",
      "webnn": "WebNN",
      "webnn-gpu": "WebNN GPU",
      "webnn-cpu": "WebNN CPU",
      "webnn-npu": "WebNN NPU"
    }
  },
  "providers.tinyModelDtype": {
    "label": "微型模型精度",
    "description": "本地微型模型的 ONNX 量化精度。默认使用模型自带的 dtype（q4）；精度越低速度越快，精度越高还原度越高。MLX 后端使用预量化的 4 位仓库，忽略此项。PI_TINY_DTYPE 环境变量可覆盖此项。",
    "options": {
      "default": "默认",
      "q4": "q4",
      "q4f16": "q4f16",
      "q8": "q8",
      "fp16": "fp16",
      "fp32": "fp32",
      "int8": "int8",
      "uint8": "uint8",
      "bnb4": "bnb4",
      "q2": "q2",
      "q2f16": "q2f16",
      "q1": "q1",
      "q1f16": "q1f16",
      "auto": "自动"
    }
  },
  "providers.autoThinkingMaxEffort": {
    "label": "自动思考强度上限",
    "description": "auto 分类器可选用的最高推理强度。xhigh 将上限设为比最高档低一级，只有显式 ultrathink 才能达到 max；max 允许分类器为其认为特别困难的轮次选择模型支持的最高档，并按该档计费。",
    "options": {
      "xhigh": "极高",
      "max": "最高"
    }
  },
  "features.unexpectedStopDetection": {
    "label": "检测意外停止",
    "description": "助手未输出可见消息便停止时，自动尝试恢复。智能模式还会用小模型判断仅有文本的停止情况。",
    "options": {
      "none": "无",
      "mechanical": "规则检测",
      "smart": "智能"
    }
  },
  "providers.kimiApiFormat": {
    "label": "Kimi API 格式",
    "description": "Kimi Code 提供商的 API 格式（auto 跟随实时模型元数据）",
    "options": {
      "auto": "自动",
      "openai": "OpenAI",
      "anthropic": "Anthropic"
    }
  },
  "providers.openaiWebsockets": {
    "label": "OpenAI WebSocket 策略",
    "description": "OpenAI Codex 模型的 websocket 策略（auto 使用模型默认值，on 强制开启，off 禁用）",
    "options": {
      "auto": "自动",
      "off": "关闭",
      "on": "开启"
    }
  },
  "providers.openaiLiveSteering": {
    "label": "OpenAI 实时引导",
    "description": "在 GPT-6 响应流式输出时，通过 Codex WebSocket 把此刻输入的消息直接送入该响应，而不必等到下一个工具边界。"
  },
  "providers.muse-code.storeResponses": {
    "label": "Muse Code 服务端存稿",
    "description": "把 Muse Code 结果存储在 Meta 服务器上，连接中断的轮次可以恢复而非重跑；存储的运行会在 Meta 侧保留提示词和输出。"
  },
  "providers.cacheRetention": {
    "label": "提示词缓存保留时间",
    "description": "将提示词缓存保留策略传给支持它的提供商（Anthropic、Bedrock、OpenRouter、OpenAI）。",
    "options": {
      "auto": "自动",
      "short": "短期（5 分钟）",
      "long": "长期（1 小时以上）",
      "none": "关闭"
    }
  },
  "providers.cacheWarming": {
    "label": "缓存保温",
    "description": "在提示词缓存条目即将过期前，以单 token 输出预算重发上一次请求",
    "options": {
      "off": "关闭",
      "streaming": "流式",
      "idle": "空闲"
    }
  },
  "providers.streamFirstEventTimeoutSeconds": {
    "label": "流首个事件超时",
    "description": "等待模型流首个事件的秒数；-1 使用提供商/环境变量默认值，0 禁用看门狗",
    "options": {
      "0": "关闭",
      "300": "5 分钟",
      "600": "10 分钟",
      "1800": "30 分钟",
      "-1": "自动"
    }
  },
  "providers.streamIdleTimeoutSeconds": {
    "label": "流空闲超时",
    "description": "模型流在事件之间允许保持静默的秒数；-1 使用提供商/环境变量默认值，0 禁用看门狗",
    "options": {
      "0": "关闭",
      "300": "5 分钟",
      "600": "10 分钟",
      "1800": "30 分钟",
      "-1": "自动"
    }
  },
  "providers.openrouterVariant": {
    "label": "OpenRouter 路由",
    "description": "附加到 OpenRouter 模型 ID 的默认路由变体后缀（当选择器已指定变体时被覆盖）",
    "options": {
      "default": "默认",
      "nitro": ":nitro",
      "floor": ":floor",
      "online": ":online",
      "exacto": ":exacto"
    }
  },
  "live.voice": {
    "label": "实时语音音色",
    "description": "Codex 支持的实时语音会话所用的音色",
    "options": {
      "arbor": "Arbor",
      "breeze": "Breeze",
      "cove": "Cove",
      "ember": "Ember",
      "juniper": "Juniper",
      "maple": "Maple",
      "sol": "Sol",
      "spruce": "Spruce",
      "vale": "Vale"
    }
  },
  "tts.localVoice": {
    "label": "本地 TTS 音色",
    "description": "本地 TTS 后端使用的 Kokoro 音色（美式/英式，女声/男声）",
    "options": {
      "af_heart": "Heart（美国女声）",
      "af_bella": "Bella（美国女声）",
      "af_nicole": "Nicole（美国女声）",
      "af_aoede": "Aoede（美国女声）",
      "af_kore": "Kore（美国女声）",
      "af_sarah": "Sarah（美国女声）",
      "am_michael": "Michael（美国男声）",
      "am_fenrir": "Fenrir（美国男声）",
      "am_puck": "Puck（美国男声）",
      "bf_emma": "Emma（英国女声）",
      "bm_george": "George（英国男声）",
      "bm_fable": "Fable（英国男声）"
    }
  },
  "tts.localSpeed": {
    "label": "本地 TTS 语速",
    "description": "本地 TTS 后端（tts 工具、omp say）的语速。1 = 正常；限制在 0.5–2.5",
    "options": {
      "1": "1×（正常）",
      "2": "2×",
      "0.5": "0.5×",
      "0.75": "0.75×",
      "1.25": "1.25×",
      "1.5": "1.5×",
      "1.75": "1.75×",
      "2.5": "2.5×"
    }
  },
  "speech.enabled": {
    "label": "语音朗读",
    "description": "助手输出在流式到达时通过扬声器朗读出来"
  },
  "speech.mode": {
    "label": "语音朗读模式",
    "description": "朗读内容：all = 助手消息 + 思考；assistant = 仅消息；yield = 仅回合结束时的最终消息",
    "options": {
      "all": "全部（消息 + 思考）",
      "assistant": "助手消息",
      "yield": "仅最终消息"
    }
  },
  "speech.enhanced": {
    "label": "增强语音改写",
    "description": "合成前用微型/smol 模型把助手输出改写为自然的口语文本（描述代码、去掉链接和 markdown）。失败时回退到机械式清理"
  },
  "speech.voice": {
    "label": "语音朗读音色",
    "description": "朗读助手输出时使用的 Kokoro 音色",
    "options": {
      "af_heart": "Heart（美国女声）",
      "af_bella": "Bella（美国女声）",
      "af_nicole": "Nicole（美国女声）",
      "af_aoede": "Aoede（美国女声）",
      "af_kore": "Kore（美国女声）",
      "af_sarah": "Sarah（美国女声）",
      "am_michael": "Michael（美国男声）",
      "am_fenrir": "Fenrir（美国男声）",
      "am_puck": "Puck（美国男声）",
      "bf_emma": "Emma（英国女声）",
      "bm_george": "George（英国男声）",
      "bm_fable": "Fable（英国男声）"
    }
  },
  "speech.speed": {
    "label": "语音朗读语速",
    "description": "朗读助手输出时的语速。1 = 正常；限制在 0.5–2.5",
    "options": {
      "1": "1×（正常）",
      "2": "2×",
      "0.5": "0.5×",
      "0.75": "0.75×",
      "1.25": "1.25×",
      "1.5": "1.5×",
      "1.75": "1.75×",
      "2.5": "2.5×"
    }
  },
  "providers.fetch": {
    "label": "抓取提供商",
    "description": "fetch/read URL 工具的阅读器后端优先级",
    "options": {
      "auto": "自动",
      "native": "原生",
      "trafilatura": "Trafilatura",
      "lynx": "Lynx",
      "parallel": "Parallel",
      "firecrawl": "Firecrawl",
      "jina": "Jina"
    }
  },
  "codexResets.autoRedeem": {
    "label": "Codex 自动兑换已存重置",
    "description": "自动使用保存的 Codex 限流重置：轮次因 5 小时或每周额度耗尽而卡住、且无其他账户可接管时恢复账户，并挽救即将过期的重置。unset 在首次使用前询问；没有提示界面时仅使用 5 分钟内过期的重置。yes 直接使用，no 关闭两类检查。",
    "options": {
      "unset": "未设置",
      "yes": "是",
      "no": "否"
    }
  },
  "codexResets.minBlockedMinutes": {
    "label": "Codex 自动兑换最小锁定时长",
    "description": "仅当自然解锁——已耗尽的 5 小时/每周窗口中最晚的那个重置——距今至少此分钟数时才自动兑换（不要为省去短暂等待而花掉稀缺额度）。调大（如 360）可忽略仅 5 小时窗口的锁定。"
  },
  "codexResets.keepCredits": {
    "label": "Codex 自动兑换保留量",
    "description": "保存的重置低于此数量时绝不自动使用（0 = 最后一份额度也可自动使用）。即将过期的额度例外——保留的额度过期等于什么都没保住。"
  },
  "codexResets.salvageHorizonHours": {
    "label": "Codex 重置挽救窗口",
    "description": "启用自动兑换时，若保存的 Codex 重置将在此小时数内过期，且任一聊天额度窗口有可恢复的用量，便提前使用。0 关闭提前挽救；5 分钟内过期的重置仍会尝试使用，不受当前用量限制。"
  },
  "claudeResets.autoRedeem": {
    "label": "Claude 重置自动兑换",
    "description": "自动使用符合条件的 Claude Cedar 或 Juniper 重置额度。Cedar 仅用于其覆盖的限额；Juniper 只能恢复单独的 5 小时封锁。unset 在首次使用前询问（无提示界面时仅使用 5 分钟内过期的重置）；yes 不询问直接使用；no 禁用封锁恢复与过期打捞。",
    "options": {
      "unset": "未设置",
      "yes": "是",
      "no": "否"
    }
  },
  "claudeResets.minBlockedMinutes": {
    "label": "Claude 自动兑换最小封锁时长",
    "description": "仅当自然解封——已耗尽的受覆盖窗口中最晚的重置——距今至少此分钟数时才自动兑换；单独的 5 小时重置绝不会用于每周或按模型的封锁。"
  },
  "claudeResets.keepCredits": {
    "label": "Claude 自动兑换保留量",
    "description": "至少保留此数量的 Claude 重置额度（0 表示最后一个符合条件的也可自动用掉）；保留量适用于提前打捞，但不适用于 5 分钟内过期的重置。"
  },
  "claudeResets.salvageHorizonHours": {
    "label": "Claude 重置打捞窗口",
    "description": "启用自动兑换时，当服务器选择的 Cedar 重置将在此小时数内过期、且其覆盖窗口有可恢复的用量时提前用掉；0 禁用提前打捞。无论用量或保留量如何，5 分钟内过期的符合条件重置仍会被尝试；提供商限额要求仍然适用。"
  },
  "provider.appendOnlyContext": {
    "label": "仅追加上下文",
    "description": "缓存系统提示词 + 工具规格并保持仅追加的消息日志，使提供商前缀缓存（DeepSeek、Xiaomi/SGLang、Anthropic）以最大比率命中。Auto 对已知支持前缀缓存的提供商启用。",
    "options": {
      "auto": "自动",
      "on": "开启",
      "off": "关闭"
    }
  },
  "thinkingBudgets.minimal": {
    "label": "思考预算（minimal）"
  },
  "thinkingBudgets.low": {
    "label": "思考预算（low）"
  },
  "thinkingBudgets.medium": {
    "label": "思考预算（medium）"
  },
  "thinkingBudgets.high": {
    "label": "思考预算（high）"
  },
  "thinkingBudgets.xhigh": {
    "label": "思考预算（xhigh）"
  },
  "thinkingBudgets.max": {
    "label": "思考预算（max）"
  },
  "telemetry.otlpExportEnabled": {
    "label": "OTLP 遥测导出",
    "description": "允许 OMP 通过 OTEL_* 端点导出 trace、日志与指标；更改在下次启动时生效。"
  },
  "advisor.enabled": {
    "label": "启用顾问",
    "description": "搭配第二个模型（分配给 'advisor' 角色），被动审查每一轮并注入批注。"
  },
  "advisor.syncBacklog": {
    "label": "顾问同步积压",
    "description": "暂停主 Agent，直到顾问积压低于阈值。数字值最多等待 30 秒；strict 会等待所有已安排的审查完成，不设总时限。off 关闭追赶等待。中止、失败或销毁时会解除等待。",
    "options": {
      "1": "积压 1 轮",
      "3": "积压 3 轮",
      "5": "积压 5 轮",
      "off": "关闭",
      "strict": "严格等待"
    }
  },
  "advisor.immuneTurns": {
    "label": "顾问免疫轮数",
    "description": "顾问的关注或阻塞级批注中断一次后，在此数量的主轮次内，后续关注级批注改为旁注，不再中断。阻塞级批注不受冷却限制。",
    "options": {
      "0": "0 轮",
      "1": "1 轮",
      "2": "2 轮",
      "3": "3 轮",
      "4": "4 轮",
      "5": "5 轮"
    }
  },
  "advisor.continueSeverity": {
    "label": "顾问唤醒级别",
    "description": "顾问批注在 Agent 已给出最终答复后唤醒它所需的最低级别；低于此级别的批注只作为卡片留在转录末尾，随你的下一条消息送达 Agent。",
    "options": {
      "nit": "轻微",
      "concern": "关注",
      "blocker": "阻塞"
    }
  },
  "advisor.reviewMode": {
    "label": "顾问审查模式",
    "description": "没有 WATCHDOG.yml 名单时的默认顾问节奏：turn 审查每个主轮次；agent-end 仅在最终产出时审查。",
    "options": {
      "turn": "每轮",
      "agent-end": "Agent 结束时"
    }
  },
  "advisor.reviewInterval": {
    "label": "顾问审查间隔",
    "description": "没有 WATCHDOG.yml 名单时的默认顾问节奏：每第 N 次符合条件的主更新审查一次；1 = 每次更新；跳过的更新随下一次计划的审查一并发送。",
    "options": {
      "1": "每次符合条件的更新",
      "2": "每第 2 次",
      "3": "每第 3 次",
      "5": "每第 5 次",
      "10": "每第 10 次"
    }
  },
  "advisor.maxNotesPerUpdate": {
    "label": "顾问每次更新批注上限",
    "description": "每次顾问提示更新最多接收的非阻塞级批注数（1–32；界面提供 1–5 的快捷选项）。阻塞级批注不受此限制。",
    "options": {
      "1": "1 条批注",
      "2": "2 条批注",
      "3": "3 条批注",
      "4": "4 条批注",
      "5": "5 条批注"
    }
  },
  "advisor.evictStaleResults": {
    "label": "清理顾问过期结果",
    "description": "每次审查前，用简短占位符替换顾问更早审查产生的 read/grep/glob 输出；最近一次审查保留。"
  },
  "workspace.additionalDirectories": {
    "label": "额外工作区目录",
    "description": "作为额外根目录加入每个会话的工作区目录（多根工作区）。可通过 /add-dir 和 /remove-dir 实时管理。路径相对于 cwd 解析，建议使用绝对路径。Agent 会被告知这些根目录存在，并可对它们 read/grep/glob。"
  },
  "contextFiles.extra": {
    "label": "额外上下文文件",
    "description": "与 AGENTS.md 一同加载的额外指令文件名。使用文件名（而非路径）的 JSON 列表，例如 [\"AGENTS.local.md\"]；[] 表示不加载额外文件。新会话开始后生效。"
  },
  "contextPromotion.enabled": {
    "label": "自动提升上下文",
    "description": "上下文溢出时切换到模型的 contextPromotionTarget，而不进行压缩；重试时的回退切换由“重试模型回退”控制。"
  },
  "extendedContext": {
    "label": "扩展上下文",
    "description": "在支持的模型上启用更大的上下文窗口，可能增加费用；关闭后使用默认或标准计费窗口。"
  },
  "compaction.enabled": {
    "label": "自动压缩",
    "description": "上下文过大时自动压缩"
  },
  "compaction.experimentalContextManagement": {
    "label": "基于笔记的上下文窗口（实验性）",
    "description": "跨上下文窗口保留持久笔记和可搜索的原始历史。"
  },
  "compaction.midTurnEnabled": {
    "label": "轮中压缩",
    "description": "在轮中安全的工具循环边界、发起下一次提供商请求前检查阈值。子代理的整个任务就是一轮，因此始终检查。"
  },
  "compaction.methodOrder": {
    "label": "压缩方法顺序",
    "description": "自动维护上下文时按此顺序尝试；当前方法不可用或失败后会继续下一个。",
    "options": {
      "remote": "服务端压缩",
      "snapcompact": "Snapcompact",
      "handoff": "交接",
      "soft": "软压缩",
      "shake": "精简"
    }
  },
  "compaction.thresholdPercent": {
    "label": "压缩阈值",
    "description": "上下文维护的百分比阈值；设为 Default 使用旧的基于预留的行为",
    "options": {
      "10": "10%",
      "20": "20%",
      "30": "30%",
      "40": "40%",
      "50": "50%",
      "60": "60%",
      "70": "70%",
      "75": "75%",
      "80": "80%",
      "85": "85%",
      "90": "90%",
      "95": "95%",
      "default": "默认"
    }
  },
  "compaction.thresholdTokens": {
    "label": "压缩 Token 上限",
    "description": "上下文维护的固定 token 上限；设置后覆盖百分比阈值",
    "options": {
      "25000": "25K token",
      "50000": "50K token",
      "100000": "100K token",
      "150000": "150K token",
      "200000": "200K token",
      "300000": "300K token",
      "500000": "500K token",
      "default": "默认"
    }
  },
  "compaction.modelThresholds": {
    "label": "按模型的压缩阈值"
  },
  "compaction.modelThresholdsEnabled": {
    "label": "启用按模型的压缩阈值"
  },
  "compaction.handoffSaveToDisk": {
    "label": "保存交接文档",
    "description": "为自动交接流程把生成的交接文档保存为 markdown 文件"
  },
  "compaction.remoteStreamingV2Enabled": {
    "label": "远程压缩 V2",
    "description": "对兼容的远程压缩模型使用 Responses 流式压缩"
  },
  "compaction.asyncEnabled": {
    "label": "异步压缩",
    "description": "接近阈值时在后台预先生成压缩结果，达到阈值后立即接入当前会话。"
  },
  "compaction.reserveTokens": {
    "label": "压缩预留 Token"
  },
  "compaction.keepRecentTokens": {
    "label": "压缩保留最近 Token"
  },
  "compaction.autoContinue": {
    "label": "压缩后自动继续"
  },
  "compaction.remoteEndpoint": {
    "label": "远程压缩端点"
  },
  "compaction.v2RetainedMessageBudget": {
    "label": "远程压缩 V2 保留预算"
  },
  "compaction.idleEnabled": {
    "label": "空闲压缩",
    "description": "token 数超过阈值时在空闲时压缩上下文"
  },
  "compaction.idleThresholdTokens": {
    "label": "空闲压缩阈值",
    "description": "触发空闲压缩的 token 数",
    "options": {
      "100000": "100K token",
      "200000": "200K token",
      "300000": "300K token",
      "400000": "400K token",
      "500000": "500K token",
      "600000": "600K token",
      "700000": "700K token",
      "800000": "800K token",
      "900000": "900K token"
    }
  },
  "compaction.idleTimeoutSeconds": {
    "label": "空闲压缩延迟",
    "description": "空闲多少秒后开始压缩；使用 1 小时提示词缓存时，改为在缓存即将过期前压缩。",
    "options": {
      "60": "1 分钟",
      "120": "2 分钟",
      "300": "5 分钟",
      "600": "10 分钟",
      "1800": "30 分钟",
      "3600": "1 小时"
    }
  },
  "compaction.supersedeReads": {
    "label": "取代过期读取",
    "description": "当同一文件被再次读取时，修剪较旧的读取结果（缓存感知，每轮运行）"
  },
  "compaction.dropUseless": {
    "label": "省略无用结果",
    "description": "工具结果被消费后，修剪被标记为上下文无用（无匹配、等待超时）的结果（缓存感知）"
  },
  "snapcompact.systemPrompt": {
    "label": "Snapcompact 系统提示词",
    "description": "实验性：将选定的系统提示词文本渲染为密集 PNG 图片并附加到首条用户消息（仅限视觉模型）。节省 token，但被成像的文本会失去提示词缓存。",
    "options": {
      "none": "无",
      "agents-md": "AGENTS.md",
      "all": "全部"
    }
  },
  "snapcompact.toolResults": {
    "label": "Snapcompact 工具结果",
    "description": "实验性：将大型工具结果（包括最新一条）渲染为密集 PNG 图片，取代文本，仅限视觉模型。可减少累积搜索和命令输出占用的 token；读取结果保持文本，除非已知模型可依据图片精确编辑。"
  },
  "tools.format": {
    "label": "工具调用模式",
    "description": "控制工具向模型呈现的方式。自动模式使用提供商原生工具调用；所选模型明确不支持时，回退到 GLM 自有格式。原生模式强制使用提供商工具调用；其他选项强制使用指定的自有格式。",
    "options": {
      "auto": "自动",
      "native": "原生",
      "glm": "GLM",
      "hermes": "Hermes",
      "kimi": "Kimi",
      "xml": "XML",
      "anthropic": "Anthropic",
      "deepseek": "DeepSeek",
      "harmony": "Harmony",
      "qwen3": "Qwen3",
      "gemini": "Gemini",
      "gemma": "Gemma",
      "minimax": "MiniMax"
    }
  },
  "snapcompact.shape": {
    "label": "Snapcompact 形状",
    "description": "snapcompact 打印文本所用的画框形状（压缩归档与内联成像）。Auto 选择针对当前模型调优的形状。",
    "options": {
      "auto": "自动",
      "8x8r-bw": "8x8 重复，黑色",
      "8x8r-sent": "8x8 重复，句子色调",
      "8x8u-bw": "8x8，黑色",
      "8x8u-sent": "8x8，句子色调",
      "6x6u-bw": "6x6 高密度，黑色",
      "6x6u-sent": "6x6 高密度，句子色调",
      "5x8-bw": "5x8 旧版，黑色",
      "5x8-sent": "5x8 旧版，句子色调",
      "6x12-dim": "6x12，弱化停用词",
      "8x13-bw": "8x13，黑色",
      "8on16-bw": "8x13，16px 间距，黑色",
      "8on22-bw": "8x13，22px 间距（行距），黑色",
      "11on16-bw": "8x13，11px 步进（字距），黑色",
      "silver16-bw": "Silver 16，CJK",
      "doc-8on16-bw": "Doc 8on16，黑色",
      "doc-8on16-sent": "Doc 8on16，句子色调",
      "doc-8on16-sent-dim": "Doc 8on16，句子色调 + 淡化停用词"
    }
  },
  "branchSummary.enabled": {
    "label": "分支摘要",
    "description": "离开分支时提示生成摘要"
  },
  "branchSummary.reserveTokens": {
    "label": "分支摘要预留 Token"
  },
  "memory.backend": {
    "label": "记忆后端",
    "description": "关闭、本地摘要管线、Mnemopi SQLite、Hindsight 远程记忆，或 Sharpshooter 项目决策记忆",
    "options": {
      "off": "关闭",
      "local": "本地",
      "hindsight": "Hindsight",
      "mnemopi": "Mnemopi",
      "sharpshooter": "Sharpshooter"
    }
  },
  "memories.enabled": {
    "label": "本地记忆（旧版开关）"
  },
  "memories.maxRolloutsPerStartup": {
    "label": "每次启动提取上限"
  },
  "memories.maxRolloutAgeDays": {
    "label": "提取会话最大年龄"
  },
  "memories.minRolloutIdleHours": {
    "label": "提取会话空闲时长"
  },
  "memories.threadScanLimit": {
    "label": "线程扫描上限"
  },
  "memories.maxRawMemoriesForGlobal": {
    "label": "全局汇总原始记忆上限"
  },
  "memories.stage1Concurrency": {
    "label": "阶段一并发数"
  },
  "memories.stage1LeaseSeconds": {
    "label": "阶段一租约时长"
  },
  "memories.stage1RetryDelaySeconds": {
    "label": "阶段一重试延迟"
  },
  "memories.phase2LeaseSeconds": {
    "label": "阶段二租约时长"
  },
  "memories.phase2RetryDelaySeconds": {
    "label": "阶段二重试延迟"
  },
  "memories.phase2HeartbeatSeconds": {
    "label": "阶段二心跳间隔"
  },
  "memories.rolloutPayloadPercent": {
    "label": "提取负载上下文占比"
  },
  "memories.phase1InputTokenLimit": {
    "label": "阶段一输入 Token 上限"
  },
  "memories.fallbackTokenLimit": {
    "label": "回退 Token 上限"
  },
  "memories.summaryInjectionTokenLimit": {
    "label": "记忆摘要注入上限"
  },
  "sharpshooter.model": {
    "label": "Sharpshooter 模型",
    "description": "用于提取和合并项目决策的模型选择器；留空则使用 smol 角色"
  },
  "sharpshooter.minPromptLength": {
    "label": "Sharpshooter 最短消息长度"
  },
  "sharpshooter.intervalMinutes": {
    "label": "Sharpshooter 合并间隔"
  },
  "sharpshooter.injectionTokenLimit": {
    "label": "Sharpshooter 注入上限"
  },
  "autolearn.enabled": {
    "label": "自动学习（实验性）",
    "description": "Agent 停止后，提醒它把经验教训沉淀到记忆，并创建/完善隔离的受管技能"
  },
  "autolearn.autoContinue": {
    "label": "停止时自动沉淀",
    "description": "开启时，停止后自动运行一个私密的沉淀轮次（消耗额外 token）。关闭时，仅保留常驻的自动学习引导。"
  },
  "autolearn.minToolCalls": {
    "label": "自动学习最小工具调用数"
  },
  "mnemopi.dbPath": {
    "label": "Mnemopi 数据库路径",
    "description": "可选的 SQLite 数据库路径。默认为 Agent 记忆目录。"
  },
  "mnemopi.bank": {
    "label": "Mnemopi 记忆库",
    "description": "可选的共享记忆库基础名称。按项目模式会由它派生项目本地记忆库。"
  },
  "mnemopi.scoping": {
    "label": "Mnemopi 作用域",
    "description": "global = 一个共享记忆库；per-project = 每个 cwd 独立记忆库；per-project-tagged = 项目本地写入 + 全局召回可见",
    "options": {
      "global": "全局",
      "per-project": "每个项目",
      "per-project-tagged": "每个项目（带标签）"
    }
  },
  "mnemopi.embeddingVariant": {
    "label": "嵌入模型变体",
    "description": "本地嵌入模型家族。en = 更强的英文模型；multilingual = 跨语言模型。更改后会在下次启动时重建现有记忆嵌入。",
    "options": {
      "en": "英语（bge-base-en-v1.5）",
      "multilingual": "多语言（multilingual-e5-large）"
    }
  },
  "mnemopi.autoRecall": {
    "label": "Mnemopi 自动召回",
    "description": "在每个会话的第一轮召回本地记忆"
  },
  "mnemopi.autoRetain": {
    "label": "Mnemopi 自动留存",
    "description": "把完成的对话轮次留存到本地 Mnemopi 记忆"
  },
  "mnemopi.polyphonicRecall": {
    "label": "Mnemopi 多声部召回",
    "description": "融合图、事实、向量和时序召回，使相关联的记忆在没有关键词匹配时也能被检索到。"
  },
  "mnemopi.enhancedRecall": {
    "label": "Mnemopi 增强召回",
    "description": "对选项相同的重复或相似查询缓存召回结果；任何记忆写入都会清空缓存。"
  },
  "mnemopi.proactiveLinking": {
    "label": "Mnemopi 主动链接",
    "description": "新记忆存储时即纳入情景图，链接到相关实体与记忆"
  },
  "mnemopi.noEmbeddings": {
    "label": "Mnemopi 禁用嵌入",
    "description": "强制使用确定性的纯 FTS 召回，而非向量嵌入"
  },
  "mnemopi.embeddingModel": {
    "label": "Mnemopi 嵌入模型",
    "description": "高级：显式嵌入模型 id，覆盖变体设置。留空则使用 mnemopi.embeddingVariant。"
  },
  "mnemopi.embeddingApiUrl": {
    "label": "Mnemopi 嵌入 API URL",
    "description": "传给 Mnemopi 的可选 OpenAI 兼容嵌入端点"
  },
  "mnemopi.embeddingApiKey": {
    "label": "Mnemopi 嵌入 API 密钥",
    "description": "传给 Mnemopi 的可选嵌入 API 密钥"
  },
  "mnemopi.llmMode": {
    "label": "Mnemopi LLM 模式",
    "description": "不使用 LLM、使用在线微型模型（/models 中的 TINY 角色，否则为 @smol），或远程 OpenAI 兼容端点",
    "options": {
      "none": "无",
      "smol": "在线（tiny）",
      "remote": "远程"
    }
  },
  "mnemopi.llmBaseUrl": {
    "label": "Mnemopi LLM 基础 URL",
    "description": "Mnemopi 远程模式的可选 OpenAI 兼容 LLM 端点"
  },
  "mnemopi.llmApiKey": {
    "label": "Mnemopi LLM API 密钥",
    "description": "Mnemopi 远程模式的可选 LLM API 密钥"
  },
  "mnemopi.llmModel": {
    "label": "Mnemopi LLM 模型",
    "description": "Mnemopi 远程模式的可选 LLM 模型名称"
  },
  "mnemopi.retainEveryNTurns": {
    "label": "Mnemopi 留存间隔"
  },
  "mnemopi.recallLimit": {
    "label": "Mnemopi 召回条数上限"
  },
  "mnemopi.recallContextTurns": {
    "label": "Mnemopi 召回上下文轮数"
  },
  "mnemopi.recallMaxQueryChars": {
    "label": "Mnemopi 召回查询长度上限"
  },
  "mnemopi.injectionTokenLimit": {
    "label": "Mnemopi 注入 Token 上限"
  },
  "mnemopi.debug": {
    "label": "Mnemopi 调试日志"
  },
  "hindsight.apiUrl": {
    "label": "Hindsight API 地址",
    "description": "Hindsight 服务器 URL（云端或自托管）"
  },
  "hindsight.apiToken": {
    "label": "Hindsight API 令牌",
    "description": "用于需要认证的 Hindsight 服务器的 Bearer 令牌"
  },
  "hindsight.bankId": {
    "label": "Hindsight 记忆库 ID",
    "description": "记忆库标识符（默认：项目名）"
  },
  "hindsight.bankIdPrefix": {
    "label": "Hindsight 记忆库 ID 前缀"
  },
  "hindsight.scoping": {
    "label": "Hindsight 作用域",
    "description": "global = 一个共享记忆库；per-project = 每个 cwd 独立记忆库；per-project-tagged = 共享记忆库带项目标签，召回时合并全局与项目记忆",
    "options": {
      "global": "全局",
      "per-project": "每个项目",
      "per-project-tagged": "每个项目（带标签）"
    }
  },
  "hindsight.bankMission": {
    "label": "Hindsight 反思使命"
  },
  "hindsight.retainMission": {
    "label": "Hindsight 留存使命"
  },
  "hindsight.autoRecall": {
    "label": "Hindsight 自动召回",
    "description": "在每个会话的第一轮召回记忆"
  },
  "hindsight.autoRetain": {
    "label": "Hindsight 自动留存",
    "description": "每 N 轮及会话边界处留存转录"
  },
  "hindsight.retainMode": {
    "label": "Hindsight 留存模式",
    "description": "full-session = 每会话更新插入一份文档；last-turn = 分块",
    "options": {
      "full-session": "完整会话",
      "last-turn": "最近一轮"
    }
  },
  "hindsight.retainEveryNTurns": {
    "label": "Hindsight 留存间隔"
  },
  "hindsight.retainOverlapTurns": {
    "label": "Hindsight 留存重叠轮数"
  },
  "hindsight.retainContext": {
    "label": "Hindsight 留存上下文标签"
  },
  "hindsight.recallBudget": {
    "label": "Hindsight 召回预算",
    "options": {
      "low": "低",
      "mid": "中",
      "high": "高"
    }
  },
  "hindsight.recallMaxTokens": {
    "label": "Hindsight 召回 Token 上限"
  },
  "hindsight.recallContextTurns": {
    "label": "Hindsight 召回上下文轮数"
  },
  "hindsight.recallMaxQueryChars": {
    "label": "Hindsight 召回查询长度上限"
  },
  "hindsight.recallTypes": {
    "label": "Hindsight 召回类型"
  },
  "hindsight.debug": {
    "label": "Hindsight 调试日志"
  },
  "hindsight.requestTimeoutMs": {
    "label": "Hindsight 请求超时"
  },
  "hindsight.reflectTimeoutMs": {
    "label": "Hindsight 反思超时"
  },
  "hindsight.recallTimeoutMs": {
    "label": "Hindsight 召回超时"
  },
  "hindsight.retainTimeoutMs": {
    "label": "Hindsight 留存超时"
  },
  "hindsight.mentalModelsEnabled": {
    "label": "Hindsight 心智模型",
    "description": "启动时把精选的反思摘要（心智模型）读入开发者指令。加载记忆库上已有的模型——不写入。搭配 hindsight.mentalModelAutoSeed 可同时自动创建内置种子集。"
  },
  "hindsight.mentalModelAutoSeed": {
    "label": "Hindsight 心智模型自动播种",
    "description": "会话启动时，创建记忆库上尚不存在的内置心智模型（project-conventions、project-decisions、user-preferences）。"
  },
  "hindsight.mentalModelMaxRenderChars": {
    "label": "Hindsight 心智模型渲染上限"
  },
  "ttsr.enabled": {
    "label": "启用 TTSR",
    "description": "当输出匹配规则模式时中断 Agent 流式输出（时间旅行流规则，Time-Traveling Stream Rules）"
  },
  "ttsr.judge": {
    "label": "判定规则（judge）",
    "description": "让 judge 模型角色对每条 `question` 规则评判已完成的回复、推理与工具调用；判定为是则把该规则注入为警告。",
    "options": {
      "auto": "自动",
      "on": "开启",
      "off": "关闭"
    }
  },
  "ttsr.contextMode": {
    "label": "TTSR 上下文模式",
    "description": "TTSR 触发时如何处理部分输出",
    "options": {
      "discard": "丢弃",
      "keep": "保留"
    }
  },
  "ttsr.interruptMode": {
    "label": "TTSR 中断模式",
    "description": "何时在流中直接中断，何时在完成后再注入警告",
    "options": {
      "always": "始终",
      "prose-only": "仅文本",
      "tool-only": "仅工具",
      "never": "从不"
    }
  },
  "ttsr.repeatMode": {
    "label": "TTSR 重复模式",
    "description": "规则如何重复触发：每会话一次，或间隔若干消息后",
    "options": {
      "once": "一次",
      "after-gap": "间隔后"
    }
  },
  "ttsr.repeatGap": {
    "label": "TTSR 重复间隔",
    "description": "规则再次触发前需要的消息数",
    "options": {
      "5": "5 条消息",
      "10": "10 条消息",
      "15": "15 条消息",
      "20": "20 条消息",
      "30": "30 条消息"
    }
  },
  "ttsr.builtinRules": {
    "label": "内置规则",
    "description": "加载 Agent 自带的默认规则（可用 ttsr.disabledRules 单独覆盖）"
  },
  "ttsr.disabledRules": {
    "label": "禁用规则",
    "description": "完全忽略的规则名称（对内置默认规则和你自己的规则都生效）"
  },
  "edit.mode": {
    "label": "编辑模式",
    "description": "选择编辑工具变体（replace、patch、hashline 或 apply_patch）",
    "options": {
      "apply_patch": "应用补丁（apply_patch）",
      "hashline": "行哈希编辑（hashline）",
      "patch": "补丁编辑（patch）",
      "replace": "文本替换（replace）",
      "sloppy": "宽松编辑（sloppy）"
    }
  },
  "edit.modelVariants": {
    "label": "按模型的编辑变体"
  },
  "edit.fuzzyMatch": {
    "label": "模糊匹配",
    "description": "对空白差异接受高置信度的模糊匹配"
  },
  "edit.fuzzyThreshold": {
    "label": "模糊匹配阈值",
    "description": "接受模糊匹配的相似度阈值（0-1）",
    "options": {
      "0.85": "0.85",
      "0.90": "0.90",
      "0.95": "0.95",
      "0.98": "0.98"
    }
  },
  "edit.streamingAbort": {
    "label": "预览失败即中止",
    "description": "补丁预览失败时中止流式编辑工具调用"
  },
  "edit.recoverInlineEdits": {
    "label": "恢复内联编辑内容",
    "description": "把模型以普通文本输出的编辑内容转换为 edit 工具调用并执行"
  },
  "edit.blockAutoGenerated": {
    "label": "保护自动生成的文件",
    "description": "阻止编辑看似自动生成的文件（protoc、sqlc、swagger 等）"
  },
  "edit.enforceSeenLines": {
    "label": "强制执行已见行守卫",
    "description": "拒绝锚定在先前读取/搜索从未完整展示过的行上的编辑"
  },
  "edit.blackbox.enabled": {
    "label": "记录编辑解析回归",
    "description": "编辑引入 AST 解析错误时，追加记录修改前后的完整源码。"
  },
  "edit.autoRepair.enabled": {
    "label": "自动修复解析错误",
    "description": "编辑导致文件无法解析时，请小模型修复出错区域，并重新解析验证；修复失败时显示警告。"
  },
  "tools.artifactSpillThreshold": {
    "label": "Artifact 溢出阈值（KB）",
    "description": "超过此大小的工具输出保存为 artifact；尾部保留内联",
    "options": {
      "1": "1 KB",
      "5": "5 KB",
      "10": "10 KB",
      "20": "20 KB",
      "30": "30 KB",
      "50": "50 KB",
      "75": "75 KB",
      "100": "100 KB",
      "200": "200 KB",
      "500": "500 KB",
      "1000": "1 MB",
      "2.5": "2.5 KB"
    }
  },
  "tools.artifactTailBytes": {
    "label": "Artifact 尾部大小（KB）",
    "description": "输出溢出为 artifact 时保留内联的尾部内容量",
    "options": {
      "1": "1 KB",
      "5": "5 KB",
      "10": "10 KB",
      "20": "20 KB",
      "50": "50 KB",
      "100": "100 KB",
      "200": "200 KB",
      "2.5": "2.5 KB"
    }
  },
  "tools.artifactHeadBytes": {
    "label": "Artifact 头部大小（KB）",
    "description": "输出溢出为 artifact 时与尾部一起保留内联的头部内容量（中间省略）。0 表示禁用——仅保留尾部。",
    "options": {
      "0": "0 KB",
      "1": "1 KB",
      "5": "5 KB",
      "10": "10 KB",
      "20": "20 KB",
      "50": "50 KB",
      "100": "100 KB",
      "200": "200 KB",
      "2.5": "2.5 KB"
    }
  },
  "tools.outputMaxColumns": {
    "label": "输出列上限",
    "description": "流式工具输出（bash、python、js eval）和 `read` 的每行字节上限。超过此宽度的行以省略号截断；到下一个换行符之间的剩余字节被丢弃。0 表示禁用。",
    "options": {
      "0": "关闭",
      "256": "256",
      "512": "512",
      "768": "768",
      "1024": "1024",
      "2048": "2048",
      "4096": "4096"
    }
  },
  "tools.artifactTailLines": {
    "label": "Artifact 尾部行数",
    "description": "输出溢出为 artifact 时保留内联的最大尾部行数",
    "options": {
      "50": "50 行",
      "100": "100 行",
      "250": "250 行",
      "500": "500 行",
      "1000": "1000 行",
      "2000": "2000 行",
      "5000": "5000 行"
    }
  },
  "tools.artifactMaxBytes": {
    "label": "Artifact 文件上限（MB）",
    "description": "为流式工具输出（bash、python、js eval）保存的 artifact 文件最大体积；超出时保留开头（最多 3 MB）与最新的末尾，中间以截断提示分隔。0 = 不限。",
    "options": {
      "0": "无限制",
      "4": "4 MB",
      "16": "16 MB",
      "64": "64 MB",
      "256": "256 MB",
      "1024": "1 GB"
    }
  },
  "readLineNumbers": {
    "label": "行号",
    "description": "默认在读取工具输出前添加行号"
  },
  "read.defaultLimit": {
    "label": "默认读取行数",
    "description": "Agent 调用 read 且不指定行数上限时默认返回的行数",
    "options": {
      "200": "200 行",
      "300": "300 行",
      "500": "500 行",
      "1000": "1000 行",
      "5000": "5000 行"
    }
  },
  "read.renderMarkdown": {
    "label": "Markdown 预览",
    "description": "将 Markdown 读取结果渲染为格式化的终端 Markdown 预览，而非原始源码"
  },
  "read.summarize.enabled": {
    "label": "读取摘要",
    "description": "当 read 不带显式选择器调用时返回结构化代码摘要"
  },
  "read.summarize.prose": {
    "label": "文本摘要",
    "description": "对 Markdown 和纯文本读取返回结构化摘要"
  },
  "read.summarize.minBodyLines": {
    "label": "摘要折叠正文行数",
    "description": "多行正文或字面量达到此行数时，读取摘要才会将其折叠。"
  },
  "read.summarize.minCommentLines": {
    "label": "摘要折叠注释行数",
    "description": "多行块注释达到此行数时，读取摘要才会将其折叠。"
  },
  "read.summarize.minTotalLines": {
    "label": "摘要最小文件行数",
    "description": "总行数少于此值的文件按原文读取，而不做结构化摘要"
  },
  "read.summarize.unfoldUntil": {
    "label": "摘要展开目标",
    "description": "BFS 展开可省略区段，直到摘要至少达到此可见行数。0 表示仅保留最外层省略。"
  },
  "read.summarize.unfoldLimit": {
    "label": "摘要展开上限",
    "description": "BFS 展开时摘要大小的硬上限。若某次展开后可见行数将超过此值，则跳过该展开（该区段保持折叠），并继续展开其余区段。"
  },
  "read.toolResultPreview": {
    "label": "内联读取预览",
    "description": "在转录中内联渲染读取工具结果，而非摘要行"
  },
  "tools.approval": {
    "label": "工具审批策略",
    "description": "按工具配置审批策略。设为 'allow' 自动批准，'prompt' 需要确认，'deny' 阻止。这些覆盖在任何审批模式下都生效。"
  },
  "tools.approvalMode": {
    "label": "工具审批",
    "description": "工具调用的默认审批行为。'总是询问' 仅自动批准只读工具；'询问并记住' 读取前也询问，且授权可按文件或文件夹记住；'写入' 自动批准读取和工作区写入工具；'Yolo' 自动批准所有层级，但用户策略仍可提示或阻止。",
    "options": {
      "always-ask": "始终询问",
      "always-ask-cached": "询问并记住",
      "write": "写入",
      "yolo": "全部自动批准"
    }
  },
  "todo.enabled": {
    "label": "待办",
    "description": "启用 todo 工具进行任务跟踪"
  },
  "todo.reminders": {
    "label": "待办提醒",
    "description": "提醒 Agent 在停止前完成待办"
  },
  "todo.remindersMax": {
    "label": "待办提醒上限",
    "description": "放弃前的最大待办提醒次数",
    "options": {
      "1": "1 次提醒",
      "2": "2 次提醒",
      "3": "3 次提醒",
      "5": "5 次提醒"
    }
  },
  "todo.eager": {
    "label": "自动创建待办",
    "description": "首条消息后推动自动创建待办列表的力度",
    "options": {
      "default": "默认",
      "preferred": "推荐",
      "always": "始终"
    }
  },
  "tasks.todoClearDelay": {
    "label": "待办自动清除延迟",
    "description": "已完成或已放弃的待办从待办部件中移除前的延迟",
    "options": {
      "0": "立即",
      "60": "1 分钟",
      "300": "5 分钟",
      "900": "15 分钟",
      "1800": "30 分钟",
      "3600": "1 小时",
      "-1": "从不"
    }
  },
  "glob.enabled": {
    "label": "文件匹配（Glob）",
    "description": "启用 glob 工具进行 glob 模式文件查找"
  },
  "grep.enabled": {
    "label": "内容搜索（Grep）",
    "description": "启用 grep 工具进行正则内容搜索"
  },
  "grep.contextBefore": {
    "label": "Grep 前置上下文",
    "description": "每个 grep 匹配前显示的上下文行数",
    "options": {
      "0": "0 行",
      "1": "1 行",
      "2": "2 行",
      "3": "3 行",
      "5": "5 行"
    }
  },
  "grep.contextAfter": {
    "label": "Grep 后置上下文",
    "description": "每个 grep 匹配后显示的上下文行数",
    "options": {
      "0": "0 行",
      "1": "1 行",
      "2": "2 行",
      "3": "3 行",
      "5": "5 行",
      "10": "10 行"
    }
  },
  "astGrep.enabled": {
    "label": "AST 结构搜索",
    "description": "启用 ast_grep 工具进行结构化 AST 搜索"
  },
  "astEdit.enabled": {
    "label": "AST 结构编辑",
    "description": "启用 ast_edit 工具进行结构化 AST 重写"
  },
  "find.enabled": {
    "label": "Find（语义搜索）",
    "description": "启用 find 工具，通过自然语言搜索文件及行范围，并由 judge 模型角色判定。自动模式仅在 judge 角色解析为原生 TypeSafe jev 模型时启用。",
    "options": {
      "auto": "自动",
      "on": "开启",
      "off": "关闭"
    }
  },
  "debug.enabled": {
    "label": "调试工具",
    "description": "启用 debug 工具进行基于 DAP 的调试"
  },
  "launch.enabled": {
    "label": "项目服务",
    "description": "启用具名 Bash 服务和 proc:// 监管，用于共享的长期运行项目进程。"
  },
  "speechgen.enabled": {
    "label": "语音生成",
    "description": "启用 tts 工具进行端侧（Kokoro）或 xAI Grok Voice 语音文件合成"
  },
  "generate_image.enabled": {
    "label": "生成图片",
    "description": "启用 generate_image 工具（文生图与图片编辑）。tools.xdev 开启时以 xd:// 设备形式暴露。"
  },
  "computer.enabled": {
    "label": "桌面控制",
    "description": "启用可编程的宿主桌面 eval 前置接口，包括截图、输入和无障碍访问。"
  },
  "ratchet.enabled": {
    "label": "Ratchet 调优",
    "description": "启用 ratchet eval/调优前奏；/ratchet 可为当前会话开启。"
  },
  "archive.enabled": {
    "label": "Archive（归档）",
    "description": "启用只读的 archive eval 前奏：提示词历史、最近项目、过往会话与回顾。"
  },
  "computer.display": {
    "label": "桌面控制显示器",
    "description": "使用活动窗口所在显示器（active）、所有显示器（all）或指定的原生显示器 ID。"
  },
  "computer.maxWidth": {
    "label": "截图宽度上限",
    "description": "截图的最大宽度（像素）。"
  },
  "computer.maxHeight": {
    "label": "截图高度上限",
    "description": "截图的最大高度（像素）。"
  },
  "computer.backgroundFallback": {
    "label": "后台输入降级",
    "description": "窗口输入的后台通道不可用时的处理方式：以接管方式重跑并把焦点还给你的应用（macOS；其他平台为普通接管），或拒绝——同时阻止 Agent 自行抢占前台或打开 macOS 菜单。",
    "options": {
      "takeover": "接管",
      "refuse": "拒绝"
    }
  },
  "images.questionTimeoutMs": {
    "label": "图片提问超时",
    "description": "read 工具通过 ?q= 向视觉模型提问时的单次请求超时（毫秒）。提供商卡顿时快速失败；设为 0 禁用超时。",
    "options": {
      "0": "已禁用",
      "60000": "1 分钟",
      "120000": "2 分钟",
      "180000": "3 分钟",
      "300000": "5 分钟"
    }
  },
  "checkpoint.enabled": {
    "label": "检查点/回退",
    "description": "启用 checkpoint 与 rewind 工具进行上下文检查点管理"
  },
  "fetch.enabled": {
    "label": "读取 URL",
    "description": "允许 read 工具抓取并处理 URL"
  },
  "vault.enabled": {
    "label": "Obsidian 仓库",
    "description": "启用 vault:// 内部 URL，通过 Obsidian CLI 读写 Obsidian 仓库内容。禁用时 vault:// 解析被拒绝，系统提示词中的 vault:// 条目也会被省略。"
  },
  "github.enabled": {
    "label": "GitHub 工具",
    "description": "启用 github 工具（基于 op 的派发，覆盖仓库、issue、pull request、diff、搜索、checkout、push 与 Actions 监视工作流）"
  },
  "github.cache.enabled": {
    "label": "GitHub 视图缓存",
    "description": "把渲染好的 issue/PR 视图输出缓存到 ~/.omp/cache/github-cache.db，重复读取零开销"
  },
  "github.cache.softTtlSec": {
    "label": "GitHub 缓存软 TTL",
    "description": "在此时间窗内直接返回缓存的 issue/PR 视图行（秒；默认 5 分钟）"
  },
  "github.cache.hardTtlSec": {
    "label": "GitHub 缓存硬 TTL",
    "description": "超过软 TTL 后返回缓存行并在后台刷新；超过硬 TTL 后丢弃（秒；默认 7 天）"
  },
  "web_search.enabled": {
    "label": "网络搜索",
    "description": "启用 web_search 工具获取实时网络结果"
  },
  "security.enabled": {
    "label": "安全",
    "description": "启用 OMP 原生安全扫描的规划、执行，以及只读的 security:// 资源命名空间"
  },
  "ask.enabled": {
    "label": "交互式提问",
    "description": "启用 ask 工具进行交互式用户提问"
  },
  "tools.intentTracing": {
    "label": "意图追踪",
    "description": "要求 Agent 在执行每个工具调用前描述其意图"
  },
  "tools.abortOnFabricatedResult": {
    "label": "捏造工具结果即中止",
    "description": "使用带内工具调用时，模型一旦在轮次中开始幻觉编造工具结果便立即停止。禁用则让模型完成生成并丢弃编造的后续内容。"
  },
  "tools.speculativeExecution.enabled": {
    "label": "实验性推测执行",
    "description": "启用可安全丢弃结果的首阶段：通过直接 read 调用和嵌套 eval 执行已验证的本地读取。此阶段不包含网络请求、提供商补全或实际文件系统写入。"
  },
  "tools.speculativeExecution.maxInFlight": {
    "label": "推测执行并发",
    "description": "正常派发前允许并行运行的已验证本地读操作上限。",
    "options": {
      "1": "1 个操作",
      "2": "2 个操作",
      "3": "3 个操作",
      "4": "4 个操作"
    }
  },
  "tools.maxTimeout": {
    "label": "工具超时上限",
    "description": "Agent 可为任何工具设置的最大超时秒数（0 = 不限制）",
    "options": {
      "0": "无限制",
      "30": "30 秒",
      "60": "60 秒",
      "120": "120 秒",
      "300": "5 分钟",
      "600": "10 分钟"
    }
  },
  "async.enabled": {
    "label": "异步执行",
    "description": "启用异步 bash 命令和后台任务执行"
  },
  "async.maxJobs": {
    "label": "后台任务数上限"
  },
  "async.widgets": {
    "label": "后台任务实时组件",
    "description": "为每个运行中的后台任务绘制实时组件（由输出推导的图表、进度条、状态格），显示在等待卡片、任务胶囊和任务面板中。`widget` 模型角色（默认走 smol）为每个任务生成一次展示规则，此后更新不再消耗模型调用。"
  },
  "tools.xdev": {
    "label": "xd:// 工具",
    "description": "将不常用、可发现的工具挂载到 xd:// 设备 URL，通过 read/write 使用，避免每次请求都携带其 schema。若会话显式工具列表包含 read 而不含 write，则通过仅设备写入通道挂载；设备之外仅 local:// 临时空间可写。关闭后，所有启用的工具都在顶层提供。"
  },
  "tools.xdevDocs": {
    "label": "xd:// 提示词文档",
    "description": "选择哪些挂载设备的文档与 schema 内联进系统提示词。Built-ins 保持核心工具内联，MCP 与扩展工具保持按需。",
    "options": {
      "inline": "所有设备",
      "builtins": "仅内置项",
      "catalog": "仅目录"
    }
  },
  "tools.xdevInlineDevices": {
    "label": "xd:// 内联设备",
    "description": "当 xd:// 提示词文档为“仅内置”时，内联名称匹配这些 glob 模式的动态设备（例如 mcp__context_mode_*）。“仅目录”忽略此设置。"
  },
  "dev.autoqa": {
    "label": "自动 QA",
    "description": "自动工具问题上报（xd://report_issue）。默认开启；首次上报会征求同意，拒绝则停止上报，直到显式重新启用"
  },
  "dev.autoqaPush.endpoint": {
    "label": "自动 QA 推送端点",
    "description": "接收自动 QA JSON 报告的完整 URL（默认 https://qa.omp.sh/v1/grievances）"
  },
  "dev.autoqaPush.token": {
    "label": "自动 QA 推送令牌"
  },
  "dev.autoqaConsent": {
    "label": "自动 QA 同意状态",
    "options": {
      "unset": "未设置",
      "granted": "已授权",
      "denied": "已拒绝"
    }
  },
  "lsp.enabled": {
    "label": "语言服务（LSP）",
    "description": "启用 lsp 工具以获得代码智能（定义、引用、诊断、重命名）"
  },
  "lsp.lazy": {
    "label": "延迟启动 LSP",
    "description": "首次使用（lsp 工具或编辑匹配文件类型）时才启动语言服务器，而非会话启动时"
  },
  "lsp.shared": {
    "label": "共享语言服务器",
    "description": "通过每个项目的守护进程代理启动语言服务器，每个连接使用独立服务器。项目中仍有其他 omp 实例运行时，已释放的服务器保持就绪，可供下个连接复用以免冷启动；代理不可用时回退到私有服务器。"
  },
  "lsp.formatOnWrite": {
    "label": "写入后格式化",
    "description": "写入代码文件后自动使用 LSP 格式化"
  },
  "lsp.diagnosticsOnWrite": {
    "label": "写入后诊断",
    "description": "写入代码文件后返回 LSP 诊断"
  },
  "lsp.diagnosticsOnEdit": {
    "label": "编辑后诊断",
    "description": "编辑代码文件后返回 LSP 诊断"
  },
  "lsp.diagnosticsDeduplicate": {
    "label": "诊断去重",
    "description": "抑制文件中已展示过的编辑后 LSP 诊断，只呈现新增或变化的"
  },
  "lsp.requestTimeout": {
    "label": "请求超时",
    "description": "代理未指定超时时，等待语言服务器诊断、悬停等应答的秒数；编辑后的延迟诊断至少等待这么久。冷启动较慢的服务器可调高。lsp 工具的 timeout 参数仍可按次调高或调低。",
    "options": {
      "10": "10 秒",
      "20": "20 秒",
      "30": "30 秒",
      "60": "1 分钟",
      "120": "2 分钟",
      "300": "5 分钟"
    }
  },
  "shellPath": {
    "label": "Shell 路径"
  },
  "shellCommandPrefix": {
    "label": "Shell 命令前缀"
  },
  "bash.enabled": {
    "label": "Bash 命令执行",
    "description": "启用 bash 工具以执行 shell 命令"
  },
  "bash.allowCompoundCommands": {
    "label": "逐条审批复合命令",
    "description": "对使用 && 连接的简单命令逐条匹配审批规则；未匹配的命令仍遵循常规 Bash 审批策略。"
  },
  "bash.autoBackground.enabled": {
    "label": "Bash 自动后台",
    "description": "自动将长时间运行的 bash 命令转入后台，稍后交付结果"
  },
  "bash.gitGuard": {
    "label": "Git 防护",
    "description": "在 bash 工具中拒绝会丢弃或移动共享工作的 git 命令：stash、reset --hard 或重置到其他提交，以及在合并/变基冲突之外的 checkout/switch/restore"
  },
  "bash.patterns": {
    "label": "Bash 审批模式",
    "description": "有序的 bash 命令审批规则。每项含 match 和 approval 字段；仅支持 '*' 通配符。"
  },
  "bashInterceptor.enabled": {
    "label": "Bash 拦截器",
    "description": "阻止已有专用工具的 shell 命令"
  },
  "bashInterceptor.patterns": {
    "label": "Bash 拦截规则"
  },
  "bash.direnv": {
    "label": "direnv 自动加载",
    "description": "自动将仓库的 direnv/devenv `.envrc` 加载到 bash 会话中，无需手动 `direnv exec` 即可使用 devenv 工具和环境变量。遵循 direnv 的允许列表：未经 `direnv allow` 的 `.envrc` 绝不会被执行",
    "options": {
      "auto": "自动",
      "off": "关闭"
    }
  },
  "bash.direnvLoadTimeoutMs": {
    "label": "direnv 加载超时（毫秒）",
    "description": "首次 `direnv export` 的最长等待时间（冷启动的 devenv shell 可能较慢）；超时后会话将在没有 direnv 环境的情况下运行"
  },
  "shellMinimizer.enabled": {
    "label": "Shell 输出压缩",
    "description": "在返回给 Agent 前压缩冗长的 shell 输出（git、npm、cargo 等）"
  },
  "shellMinimizer.settingsPath": {
    "label": "Shell 压缩设置文件"
  },
  "shellMinimizer.only": {
    "label": "Shell 压缩白名单"
  },
  "shellMinimizer.except": {
    "label": "Shell 压缩排除列表"
  },
  "shellMinimizer.maxCaptureBytes": {
    "label": "Shell 压缩捕获上限"
  },
  "shellMinimizer.sourceOutlineLevel": {
    "label": "Shell 压缩源码大纲",
    "description": "cat/read 源码文件时的源码大纲模式：default 或 aggressive",
    "options": {
      "default": "默认",
      "aggressive": "激进"
    }
  },
  "shellMinimizer.legacyFilters": {
    "label": "Shell 旧版过滤器"
  },
  "bash.autoBackground.thresholdMs": {
    "label": "自动后台阈值"
  },
  "eval.py": {
    "label": "Python Eval 后端",
    "description": "允许 eval 工具把 Python 单元格派发到 IPython 内核"
  },
  "eval.js": {
    "label": "JavaScript Eval 后端",
    "description": "允许 eval 工具把 JavaScript 单元格派发到进程内运行时"
  },
  "eval.autoProvision": {
    "label": "Eval 环境自动配置",
    "description": "首次安装时自动创建托管的 JavaScript eval 包环境。"
  },
  "eval.tools.enabled": {
    "label": "Eval 定义的工具",
    "description": "允许 eval 单元定义工具（Python 的 @tool 或 JS 的 tool(fn)），供 task、agent() 和 workpool() 子代理调用。"
  },
  "eval.workpool.freshAgents": {
    "label": "Workpool 使用全新 Agent",
    "description": "为每个 workpool 项启动新的子代理，不复用 worker 或批量处理排队项"
  },
  "eval.autoBackground.enabled": {
    "label": "Eval 自动转后台",
    "description": "自动把长时间运行的 eval 单元转入后台，完成后再投递结果。"
  },
  "eval.autoBackground.thresholdMs": {
    "label": "Eval 自动后台阈值"
  },
  "python.kernelMode": {
    "label": "Python 内核模式",
    "description": "在 eval 调用之间保持 IPython 内核存活，或每次全新启动",
    "options": {
      "session": "会话",
      "per-call": "每次调用"
    }
  },
  "python.interpreter": {
    "label": "Python 解释器",
    "description": "指向精确 Python 可执行文件的可选路径。设置后跳过自动 Python 运行时探测。"
  },
  "task.isolation.enabled": {
    "label": "允许任务隔离",
    "description": "允许通过 `isolated: true` 为单个任务启用隔离；未指定的任务在共享检出目录中运行。"
  },
  "isolation.backend": {
    "label": "隔离后端",
    "description": "用于子代理隔离与 worktree 克隆的后端",
    "options": {
      "auto": "自动",
      "apfs": "APFS",
      "btrfs": "btrfs",
      "zfs": "ZFS",
      "reflink": "引用链接",
      "overlayfs": "Overlayfs",
      "projfs": "ProjFS",
      "block-clone": "块克隆",
      "rcopy": "递归复制"
    }
  },
  "worktree.clone": {
    "label": "将当前检出克隆到 Worktree",
    "description": "新 worktree 优先使用写时复制克隆当前检出，使 node_modules、target 等忽略的构建产物一并保留；不支持时回退为普通检出"
  },
  "worktree.cleanSource": {
    "label": "创建 /wt 后清理源检出",
    "description": "使用 /wt 创建 worktree 并带走更改后，重置源检出的已跟踪更改并删除未跟踪文件"
  },
  "worktree.onStart": {
    "label": "启动时建 Worktree",
    "description": "新的交互式会话是否在新的关联 worktree 中开始。",
    "options": {
      "off": "关闭",
      "ask": "询问",
      "create": "创建"
    }
  },
  "worktree.onExit": {
    "label": "退出时处理 Worktree",
    "description": "退出时如何处理 omp 启动以来（启动时或通过 /wt）创建的 worktree。",
    "options": {
      "keep": "保留",
      "ask": "询问",
      "remove": "移除"
    }
  },
  "task.isolation.apply": {
    "label": "应用隔离更改",
    "description": "自动把成功的隔离任务更改应用到父检出；禁用则保留 patch 或分支产物"
  },
  "task.isolation.merge": {
    "label": "隔离合并策略",
    "description": "隔离任务更改的整合方式（应用 patch 或合并分支）",
    "options": {
      "patch": "补丁",
      "branch": "分支"
    }
  },
  "task.isolation.commits": {
    "label": "隔离提交风格",
    "description": "嵌套仓库更改的提交消息风格（通用或 AI 生成）",
    "options": {
      "generic": "通用",
      "ai": "AI 生成"
    }
  },
  "worktree.base": {
    "label": "Worktree 基础目录",
    "description": "Agent 管理的 worktree 的基础目录——任务隔离副本、`github` PR 检出和 `omp worktree` 清理都位于此处。未设置时使用 ~/.omp/wt。必须是绝对路径或 ~ 相对路径；相对路径会被忽略。OMP_WORKTREE_DIR 环境变量可覆盖此项。"
  },
  "task.eager": {
    "label": "优先任务委派",
    "description": "推动把工作委派给子代理的力度",
    "options": {
      "default": "默认",
      "preferred": "推荐",
      "always": "始终"
    }
  },
  "task.batch": {
    "label": "批量任务调用",
    "description": "把 task 工具切换为批量形态：一次调用携带 { context, tasks[] }——每项一个子代理，可选按项指定 agent（默认为会话派生策略 agent）、按项隔离，并带有一份前置到每个任务的共享上下文。async.enabled=true 时，每个派生作为独立后台 agent 运行，走正常的 idle/parked 生命周期；否则调用阻塞等待合并结果。禁用则恢复扁平的单次派生 schema。"
  },
  "task.structured": {
    "label": "结构化任务结果",
    "description": "在 task 工具上暴露 outputSchema/schemaMode，子代理结果通过 yield 工具返回并按调用方或 agent 的输出 schema 校验。关闭时 task 子代理没有 yield 工具、以纯文本返回最终消息（定义中设 structured: true 的 agent 除外）；eval agent()/workpool 产生的子代理始终返回结构化结果。"
  },
  "task.speculativeLaunch": {
    "label": "投机式任务启动",
    "description": "批量子代理在其 tasks[] 项流式解析完成时立即启动，而不等待整个 task 调用结束；若最终调用校验失败、被阻止或参数变化，已启动的 agent 会被中止。需要 task 自动批准且没有扩展工具生命周期处理器。"
  },
  "task.enableEffort": {
    "label": "按任务指定强度",
    "description": "在任务派生上暴露可选的 effort 参数，允许调用方覆盖每个子代理的思考等级"
  },
  "task.maxConcurrency": {
    "label": "最大并发任务数",
    "description": "并发运行的子代理最大数量",
    "options": {
      "0": "无限制",
      "1": "1 个任务",
      "2": "2 个任务",
      "4": "4 个任务",
      "8": "8 个任务",
      "16": "16 个任务",
      "32": "32 个任务",
      "64": "64 个任务"
    }
  },
  "task.enableLsp": {
    "label": "子代理使用 LSP",
    "description": "允许 task 工具派生的子代理使用 lsp 工具。默认关闭以保持子代理低成本；当 LSP 感知的委派值得额外 token 时启用。"
  },
  "task.maxRecursionDepth": {
    "label": "任务递归深度上限",
    "description": "子代理可以派生自己子代理的层级深度",
    "options": {
      "0": "无",
      "1": "一层",
      "2": "两层",
      "3": "三层",
      "-1": "无限制"
    }
  },
  "task.maxRuntimeMs": {
    "label": "子代理运行时长上限",
    "description": "每个子代理的硬性墙钟时限（毫秒）。0 表示禁用。用于防御逃脱推理层看门狗的提供商侧流式挂起；触发时按“超时”原因正常中止子代理。",
    "options": {
      "0": "无限制",
      "300000": "5 分钟",
      "900000": "15 分钟",
      "1800000": "30 分钟",
      "3600000": "1 小时"
    }
  },
  "task.completionProbe": {
    "label": "子代理完成度探测",
    "description": "通过类似 /btw 的缓存旁路请求，询问运行中的子代理任务完成度：分别在 2、5、10、30 分钟后及此后每小时估算一次；估算值显示在 wait 与 task 视图中。仅交互式会话主 Agent 派生的子代理会被询问；print、RPC、ACP 与 SDK 运行从不探测。"
  },
  "task.agentIdleTtlMs": {
    "label": "Agent 空闲 TTL",
    "description": "空闲子代理在内存中保持存活的时长，之后被停泊到磁盘（毫秒）。被停泊的 agent 在收到消息或被恢复时自动唤醒。0 表示空闲 agent 保持存活直到退出。"
  },
  "task.softRequestBudget": {
    "label": "子代理软请求预算",
    "description": "每个子代理单次运行的助手请求软预算。超过后注入收尾提示（见 task.softRequestBudgetNotice）；达到预算的 1.5 倍时强制停止，交回已有发现。0 关闭限制。内置 scout/sonic 代理有更低的预算上限，设为更低值时仍生效。task.agentSoftRequestBudget 中对应代理的条目会替代此预算。",
    "options": {
      "0": "已禁用",
      "90": "90 次请求",
      "150": "150 次请求",
      "200": "200 次请求"
    }
  },
  "task.agentSoftRequestBudget": {
    "label": "按 Agent 的软请求预算"
  },
  "task.softRequestBudgetNotice": {
    "label": "软请求预算提示",
    "description": "当子代理越过软请求预算时注入一条引导提示，要求它在 1.5 倍强制交出停止前收尾。"
  },
  "task.maxEffort": {
    "label": "单次派生强度上限",
    "description": "task 工具按派生 effort 提示所允许的最大推理强度。较低的值防止调用方把子代理提升到超过此上限；默认值保留模型的完整范围。",
    "options": {
      "minimal": "最低",
      "low": "低",
      "medium": "中",
      "high": "高",
      "xhigh": "极高",
      "max": "最高"
    }
  },
  "task.disabledAgents": {
    "label": "禁用的子代理"
  },
  "task.agentModelOverrides": {
    "label": "按子代理的模型覆盖"
  },
  "task.agentServiceTierOverrides": {
    "label": "子任务服务层级覆盖"
  },
  "task.agentCompactionThresholdOverrides": {
    "label": "按 agent 的压缩阈值覆盖"
  },
  "task.agentAccountPools": {
    "label": "按 agent 的账号池"
  },
  "task.agentPrewalk": {
    "label": "按子代理的 Prewalk 覆盖"
  },
  "task.agentAdvisor": {
    "label": "子代理顾问（按 agent）"
  },
  "task.prewalk": {
    "label": "通用任务 Prewalk",
    "description": "为内置通用 task 子代理启用 prewalk：以解析出的模型启动，规划并开始实现，在首次编辑或写入时交接给 smol 角色。按代理覆盖（task.agentPrewalk，通过 /agents 管理）和用户代理定义中的 prewalk 前置元数据不受此开关影响。"
  },
  "task.showResolvedModelBadge": {
    "label": "显示解析后模型徽章",
    "description": "在任务部件状态行中显示每个子代理实际使用的模型 ID"
  },
  "plan.enabled": {
    "label": "计划模式",
    "description": "启用计划模式：执行前先进行只读探索与规划"
  },
  "plan.defaultOnStartup": {
    "label": "以计划模式启动",
    "description": "每个新会话开始时自动进入计划模式"
  },
  "plan.autosave": {
    "label": "自动保存计划",
    "description": "计划模式完成时自动把已批准的计划保存到磁盘。"
  },
  "plan.autosaveDir": {
    "label": "自动保存目录",
    "description": "自动保存计划的目录，支持 ~、绝对路径及相对于 cwd 的路径；留空使用 <project>/.omp/plans/。"
  },
  "goal.enabled": {
    "label": "目标模式",
    "description": "启用按会话的目标模式和隐藏的 goal 工具"
  },
  "goal.statusInFooter": {
    "label": "在底栏显示目标状态",
    "description": "在状态栏的目标指示旁显示 token 预算"
  },
  "goal.continuationModes": {
    "label": "目标续行模式",
    "description": "允许活动目标在轮次之间自动继续的运行模式（interactive、rpc）。"
  },
  "title.icons": {
    "label": "标题图标",
    "description": "新生成或 /rename 会话标题前添加的图标与短代码。",
    "options": {
      "nf+emoji": "Nerd Font + 表情",
      "emoji": "表情",
      "boring": "纯文本"
    }
  },
  "title.generator": {
    "label": "标题生成器",
    "description": "根据用户消息为未命名会话命名的方式。",
    "options": {
      "fork": "分叉",
      "tiny": "Tiny 模型"
    }
  },
  "title.refreshOnReplan": {
    "label": "重新规划时刷新标题",
    "description": "待办初始化导致重新规划后刷新生成的会话标题，除非标题由用户设置"
  },
  "extensions": {
    "label": "扩展路径"
  },
  "disabledExtensions": {
    "label": "禁用的扩展"
  },
  "skills.registryUrl": {
    "label": "技能注册表",
    "description": "`omp skill` 用于安装、搜索与发布技能的 Skillshare 注册表（https://host[:port]）。"
  },
  "skills.enabled": {
    "label": "启用技能"
  },
  "skills.enableSkillCommands": {
    "label": "技能命令",
    "description": "把技能注册为 /skill:name 命令"
  },
  "skills.enableCodexUser": {
    "label": "Codex 用户技能"
  },
  "skills.enableClaudeUser": {
    "label": "Claude 用户技能"
  },
  "skills.enableClaudeProject": {
    "label": "Claude 项目技能"
  },
  "skills.enablePiUser": {
    "label": "Pi 用户技能"
  },
  "skills.enablePiProject": {
    "label": "Pi 项目技能"
  },
  "skills.enableAgentsUser": {
    "label": "Agents 用户技能"
  },
  "skills.enableAgentsProject": {
    "label": "Agents 项目技能"
  },
  "skills.customDirectories": {
    "label": "自定义技能目录"
  },
  "skills.ignoredSkills": {
    "label": "忽略的技能"
  },
  "skills.includeSkills": {
    "label": "仅包含的技能"
  },
  "commands.enableClaudeUser": {
    "label": "Claude 用户命令",
    "description": "从 ~/.claude/commands/ 加载命令"
  },
  "commands.enableClaudeProject": {
    "label": "Claude 项目命令",
    "description": "从 .claude/commands/ 加载命令"
  },
  "commands.enableOpencodeUser": {
    "label": "OpenCode 用户命令",
    "description": "从 ~/.config/opencode/commands/ 加载命令"
  },
  "commands.enableOpencodeProject": {
    "label": "OpenCode 项目命令",
    "description": "从 .opencode/commands/ 加载命令"
  },
  "extensionHandlers.toolCallTimeoutMs": {
    "label": "扩展工具调用超时（毫秒）",
    "description": "扩展 tool_call 处理器实际工作的超时，必须为有限正数（毫秒）；无效值使用 30000 毫秒。等待 OMP 自有对话框的时间不计入。"
  },
  "exa.enabled": {
    "label": "Exa 搜索",
    "description": "启用 Exa 网络搜索提供商。"
  },
  "exa.searchDelayMs": {
    "label": "Exa 搜索延迟",
    "description": "Exa 网络搜索请求之间的最小延迟（毫秒）；设为 0 禁用节流"
  },
  "searxng.endpoint": {
    "label": "SearXNG 端点",
    "description": "用于网络搜索的自托管 SearXNG 实例基础 URL"
  },
  "searxng.token": {
    "label": "SearXNG 访问令牌"
  },
  "searxng.basicUsername": {
    "label": "SearXNG Basic 用户名"
  },
  "searxng.basicPassword": {
    "label": "SearXNG Basic 密码"
  },
  "searxng.categories": {
    "label": "SearXNG 分类"
  },
  "searxng.engines": {
    "label": "SearXNG 引擎"
  },
  "searxng.language": {
    "label": "SearXNG 语言"
  },
  "searxng.safesearch": {
    "label": "SearXNG 安全搜索"
  },
  "browser.enabled": {
    "label": "浏览器",
    "description": "启用浏览器 eval 前置接口，通过 Puppeteer 编程控制 Chromium。"
  },
  "browser.cdpUrl": {
    "label": "浏览器 CDP URL",
    "description": "默认的 HTTP CDP 发现端点（例如 http://127.0.0.1:9222），用于附着到已有浏览器而不是启动新浏览器。工具调用中显式的 app.cdp_url 或 app.path 优先。"
  },
  "browser.relay": {
    "label": "浏览器中继",
    "description": "通过 omp 浏览器中继控制自己的 Chrome 标签页。只需安装一次扩展（`omp browser-relay install`）；浏览器工具需要时会自动启动中继服务器。它优先于浏览器 CDP URL；可设置 PI_BROWSER_RELAY=0 或 PI_BROWSER_RELAY=1 覆盖。"
  },
  "browser.relayUrl": {
    "label": "浏览器中继 URL",
    "description": "omp 浏览器中继端点（默认 http://127.0.0.1:9224）"
  },
  "browser.headless": {
    "label": "无头浏览器",
    "description": "以无头模式启动浏览器（禁用则显示浏览器界面）"
  },
  "browser.cmux": {
    "label": "cmux 浏览器",
    "description": "有 cmux socket 可用时，使用 cmux WKWebView 表面进行浏览器自动化。可用 PI_BROWSER_CMUX=0 或 PI_BROWSER_CMUX=1 覆盖。"
  },
  "browser.tern": {
    "label": "Tern 浏览器",
    "description": "在 Tern 面板中把浏览器标签以画中画覆盖在 omp 面板上（原生 WebView），而非无头 Chromium；无可用 Tern 窗口时回退 Chromium。显式 app 选项、relay 与浏览器 CDP URL 优先；app.tern:false 可单独退出。可用 PI_BROWSER_TERN=0 或 =1 覆盖。"
  },
  "browser.freezeOnTurnEnd": {
    "label": "回合结束时冻结浏览器标签",
    "description": "一轮结束时冻结由 OMP 管理的无头浏览器标签，避免动画页面在空闲时持续占用 CPU/GPU。下次使用时自动解冻；打开标签时传入 persist:true 可使其保持活动。"
  },
  "browser.idleCloseSec": {
    "label": "浏览器空闲关闭超时",
    "description": "关闭空闲超过此秒数的 OMP 无头浏览器标签和 Tern 浏览器画中画。0 表示从不自动关闭，但会话销毁时仍会清理。不会影响中继、CDP、另行启动的浏览器或其他会话的标签。",
    "options": {
      "0": "从不",
      "900": "15 分钟",
      "1800": "30 分钟",
      "3600": "1 小时"
    }
  },
  "browser.screenshotDir": {
    "label": "截图目录",
    "description": "保存截图的目录。未设置时截图写入临时文件。支持 ~。示例：~/Downloads、~/Desktop、/sdcard/Download（Android）"
  },
  "ida.enabled": {
    "label": "启用 IDA Pro",
    "description": "用 IDA Pro（idalib）打开 read 读取的可执行文件并启用 ida 工具；未找到 IDA 安装时无效。"
  },
  "ida.python": {
    "label": "IDA Python 解释器",
    "description": "能导入 ida_domain 与 idapro 的 Python 解释器；留空自动检测。"
  },
  "ida.installDir": {
    "label": "IDA 安装目录",
    "description": "包含 libidalib 的目录，导出为 IDADIR；留空自动检测（$IDADIR、ida-config.json、标准安装路径）。"
  },
  "ida.maxOpen": {
    "label": "IDA 同时打开上限",
    "description": "每个项目最多同时打开的 IDA 数据库数（omp ps 中的 omp.ida.* 守护进程）；再打开时保存并关闭最久未用的空闲库。",
    "options": {
      "2": "2",
      "4": "4",
      "8": "8",
      "16": "16"
    }
  },
  "ida.idleCloseSec": {
    "label": "IDA 空闲关闭超时",
    "description": "空闲超过此秒数的 IDA 数据库将被保存并关闭（0 = 从不）；exec 命名空间在重新打开时重置。",
    "options": {
      "0": "从不",
      "300": "5 分钟",
      "900": "15 分钟",
      "1800": "30 分钟",
      "3600": "1 小时"
    }
  },
  "mcp.enableProjectConfig": {
    "label": "MCP 项目配置",
    "description": "从项目根加载 .mcp.json/mcp.json"
  },
  "mcp.startupTimeoutMs": {
    "label": "MCP 启动等待窗口",
    "description": "等待初始 MCP 工具发现的毫秒数；0 表示一直等到连接就绪。"
  },
  "mcp.renderMarkdownResults": {
    "label": "MCP Markdown 结果",
    "description": "把非 JSON 的 MCP 文本结果在转录中渲染为 Markdown"
  },
  "mcp.notifications": {
    "label": "MCP 更新注入",
    "description": "把 MCP 资源更新注入 Agent 对话"
  },
  "mcp.notificationDebounceMs": {
    "label": "MCP 通知防抖",
    "description": "MCP 资源更新注入对话前的防抖窗口（毫秒）"
  },
  "images.urls.enabled": {
    "label": "以 URL 发送图片",
    "description": "通过配置的后端链发布待发送图片，向支持 URL 抓取的提供商发送短链接，取代内联 base64。所有后端失败，或提供商抓取失败时，自动回退到内联图片。"
  },
  "images.urls.backends": {
    "label": "图片 URL 后端",
    "description": "发布图片时按顺序尝试的目标",
    "options": {
      "imgur": "Imgur",
      "imageshack": "ImageShack",
      "flickr": "Flickr",
      "chevereto": "Chevereto",
      "vgyme": "vgy.me",
      "dropbox": "Dropbox",
      "ftp": "FTP / FTPS / SFTP",
      "onedrive": "OneDrive",
      "google-drive": "Google Drive",
      "puush": "puush 兼容端点",
      "box": "Box",
      "amazon-s3": "Amazon S3",
      "google-cloud-storage": "Google Cloud Storage",
      "azure-storage": "Azure Blob Storage",
      "backblaze-b2": "Backblaze B2",
      "owncloud": "ownCloud / Nextcloud",
      "mediafire": "MediaFire 兼容端点",
      "sendspace": "SendSpace 兼容端点",
      "localhostr": "Hostr 兼容端点",
      "lambda": "Lambda 兼容端点",
      "pomf": "Pomf",
      "uguu": "Uguu",
      "seafile": "Seafile",
      "s-ul": "s-ul",
      "lobfile": "LobFile 兼容端点",
      "transfer-sh": "transfer.sh 兼容端点",
      "plik": "Plik",
      "shared-folder": "共享文件夹",
      "catbox": "Catbox",
      "litterbox": "Litterbox",
      "0x0": "0x0.st",
      "tmpfiles": "tmpfiles.org",
      "discord": "Discord",
      "provider-files": "提供商文件",
      "direct": "公开直连 URL",
      "cloudflared": "Cloudflare 快速隧道",
      "ngrok": "ngrok",
      "tailscale": "Tailscale Funnel",
      "ssh": "SSH 反向隧道",
      "command": "自定义上传命令",
      "localhost-run": "localhost.run",
      "pinggy": "Pinggy",
      "devtunnel": "Microsoft 开发隧道",
      "zrok": "zrok",
      "bore": "bore",
      "named-cloudflared": "命名 Cloudflare Tunnel",
      "r2": "Cloudflare R2",
      "tigris": "Tigris",
      "minio": "MinIO",
      "garage": "Garage"
    }
  },
  "images.urls.options": {
    "label": "图片 URL 后端选项"
  },
  "images.urls.credentials": {
    "label": "图片 URL 后端凭据"
  },
  "images.urls.command": {
    "label": "图片上传命令",
    "description": "命令后端的 argv 模板：{file} 为图片路径，{mime}/{ext} 可选；使用标准输出中最后一个 URL（如 pasta -b -f {file}）。"
  },
  "images.urls.publicBaseUrl": {
    "label": "图片公共 URL",
    "description": "指向图片 blob 服务的外部可访问基础 URL；ssh 必填，direct 可选。"
  },
  "images.urls.ttlHours": {
    "label": "图片 URL 有效期",
    "description": "本地托管图片 URL 的有效小时数，从对话最近一次发送该图片时计算；恢复会话会在原链接上重新计时。0 表示 broker 运行期间保持链接有效。"
  },
  "images.urls.bindHost": {
    "label": "图片服务监听地址",
    "description": "图片 blob 服务监听的主机地址；隧道使用回环地址，直接提供服务使用 0.0.0.0。"
  },
  "images.urls.sshTarget": {
    "label": "图片 SSH 目标",
    "description": "建立 SSH 反向转发的 user@host 目标"
  },
  "images.urls.sshRemotePort": {
    "label": "图片 SSH 远端端口",
    "description": "SSH 反向转发的远端监听端口，供你的 Web 服务器代理。"
  },
  "secrets.enabled": {
    "label": "隐藏密钥",
    "description": "发送给 AI 提供商前，混淆已配置的密钥并对凭据形态的 token 脱敏"
  },
  "stt.enabled": {
    "label": "语音转文字",
    "description": "启用通过麦克风的语音转文字输入"
  },
  "stt.language": {
    "label": "语音识别语言"
  },
  "stt.submitTrigger": {
    "label": "语音听写提交触发",
    "description": "选择语音听写自动提交的时机：从不、松手时（至少 2 个词）、松手且句子完整时，或说出“提交”时。",
    "options": {
      "never": "从不",
      "release": "松开时",
      "release-complete": "松手且句子完整时",
      "say-submit": "说出“提交”时"
    }
  },
  "collab.relayUrl": {
    "label": "中继 URL",
    "description": "/collab 使用的中继（wss://host[:port]）"
  },
  "collab.webUrl": {
    "label": "协作网页 URL",
    "description": "/collab 链接使用的浏览器 UI；留空则从 collab.relayUrl 推导；显式 http:// 仅限 localhost"
  },
  "collab.displayName": {
    "label": "显示名称",
    "description": "向其他协作参与者显示的名字（默认：操作系统用户名）"
  },
  "collab.autoStart": {
    "label": "协作自动启动",
    "description": "交互式会话启动时，通过 collab.relayUrl 托管并发布到本地注册表（omp collab list）；切换会话时更换协作房间。",
    "options": {
      "off": "关闭",
      "view": "只读视图",
      "control": "控制"
    }
  },
  "share.serverUrl": {
    "label": "分享服务器",
    "description": "/share 使用的分享查看/上传基础地址（加密 blob 上传 + 查看器；链接形如 <base>/<id>#<key>）"
  },
  "share.store": {
    "label": "分享存储",
    "description": "/share 上传加密会话 blob 的位置",
    "options": {
      "blob": "加密数据块",
      "gist": "GitHub Gist"
    }
  },
  "share.redactSecrets": {
    "label": "分享密钥脱敏",
    "description": "上传前对 /share 快照运行密钥混淆器（使用 secrets.* 配置）"
  },
  "stream.serverUrl": {
    "label": "直播服务器",
    "description": "omp stream 使用的直播服务器（https://host[:port]）；观众访问 <base>/<你的 Stencil 用户名>。"
  },
  "stream.redactPatterns": {
    "label": "额外脱敏模式",
    "description": "在环境变量、secrets.yml 值和内置凭据模式之外，对每条直播数据行额外应用的脱敏正则表达式。"
  },
  "commit.mapReduceEnabled": {
    "label": "提交分析 Map-Reduce"
  },
  "commit.mapReduceThreshold": {
    "label": "分批生成提交信息的阈值"
  },
  "commit.mapBatchTokenBudget": {
    "label": "提交分析每批 Token 预算"
  },
  "commit.cacheEnabled": {
    "label": "缓存提交分析结果"
  },
  "commit.cacheTtlDays": {
    "label": "提交分析缓存天数"
  },
  "commit.changelogMaxDiffChars": {
    "label": "更新日志 Diff 字符上限"
  },
  "gc.blobs": {
    "label": "GC 清理 Blob"
  },
  "gc.archive": {
    "label": "GC 归档冷会话"
  },
  "gc.wal": {
    "label": "GC 处理 WAL"
  },
  "gc.coldArchiveAfterDays": {
    "label": "冷归档天数"
  },
  "gc.retainNewestGlobal": {
    "label": "全局保留最新会话数"
  },
  "gc.retainNewestPerCwd": {
    "label": "每目录保留最新会话数"
  },
  "gc.stale": {
    "label": "GC 清理陈旧文件"
  },
  "gc.staleRetainNewest": {
    "label": "陈旧清理保留最新数"
  },
  "gc.staleRetainDays": {
    "label": "陈旧清理保留天数"
  },
  "gc.compress": {
    "label": "压缩冷会话文件"
  },
  "gc.compressAfterDays": {
    "label": "压缩闲置天数"
  }
};
