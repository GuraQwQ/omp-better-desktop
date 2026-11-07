---
name: "Better OMP Desktop"
description: "本地桌面开发助手的明暗主题、控件与工作台布局"
colors:
  surface: "#fcfcfb"
  surface-raised: "#ffffff"
  sidebar: "#f5f5f3"
  text: "#252925"
  secondary: "#565e57"
  muted: "#626b61"
  line: "#dce1d8"
  line-soft: "#e9ece6"
  hover: "#ecefe8"
  selected: "#e6ebe1"
  accent: "#42664b"
  accent-soft: "#edf3e9"
  accent-line: "#b7cbb5"
  on-accent: "#ffffff"
  focus: "#719275"
  input-focus: "#98ac94"
  selection: "#dce8d5"
  success: "#36734c"
  danger: "#a23d32"
  error-surface: "#fff1ed"
  user-message: "#f0f2ed"
  tool-surface: "#fafbf8"
  code-surface: "#f0f2ed"
  diff-added: "#edf6ed"
  diff-removed: "#fff0ed"
  dark-surface: "#151714"
  dark-surface-raised: "#1c1f1b"
  dark-sidebar: "#111310"
  dark-text: "#e3e7df"
  dark-secondary: "#afb8ac"
  dark-muted: "#929c8e"
  dark-line: "#353c31"
  dark-line-soft: "#292f25"
  dark-hover: "#262c23"
  dark-selected: "#2c3627"
  dark-accent: "#a7c698"
  dark-accent-soft: "#283324"
  dark-accent-line: "#52684b"
  dark-on-accent: "#1b2717"
  dark-focus: "#a4c398"
  dark-input-focus: "#66795c"
  dark-selection: "#445a3b"
  dark-success: "#98c39c"
  dark-danger: "#edaa9b"
  dark-error-surface: "#372723"
  dark-user-message: "#22281f"
  dark-tool-surface: "#191e17"
  dark-code-surface: "#20261d"
  dark-diff-added: "#253325"
  dark-diff-removed: "#392723"
typography:
  display:
    fontFamily: "'Segoe UI Variable', 'Segoe UI', -apple-system, BlinkMacSystemFont, 'Noto Sans SC', sans-serif"
    fontSize: "28px"
    fontWeight: 560
    lineHeight: 1.3
    letterSpacing: "-.025em"
  display-dark:
    fontFamily: "'Segoe UI Variable', 'Segoe UI', -apple-system, BlinkMacSystemFont, 'Noto Sans SC', sans-serif"
    fontSize: "28px"
    fontWeight: 540
    lineHeight: 1.3
    letterSpacing: "-.025em"
  headline:
    fontFamily: "'Segoe UI Variable', 'Segoe UI', -apple-system, BlinkMacSystemFont, 'Noto Sans SC', sans-serif"
    fontSize: "20px"
    fontWeight: 560
    lineHeight: 1.5
    letterSpacing: "-.015em"
  headline-dark:
    fontFamily: "'Segoe UI Variable', 'Segoe UI', -apple-system, BlinkMacSystemFont, 'Noto Sans SC', sans-serif"
    fontSize: "20px"
    fontWeight: 540
    lineHeight: 1.5
    letterSpacing: "-.015em"
  title:
    fontFamily: "'Segoe UI Variable', 'Segoe UI', -apple-system, BlinkMacSystemFont, 'Noto Sans SC', sans-serif"
    fontSize: "18px"
    fontWeight: 560
    lineHeight: 1.5
  title-dark:
    fontFamily: "'Segoe UI Variable', 'Segoe UI', -apple-system, BlinkMacSystemFont, 'Noto Sans SC', sans-serif"
    fontSize: "18px"
    fontWeight: 540
    lineHeight: 1.5
  body:
    fontFamily: "'Segoe UI Variable', 'Segoe UI', -apple-system, BlinkMacSystemFont, 'Noto Sans SC', sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  body-dark:
    fontFamily: "'Segoe UI Variable', 'Segoe UI', -apple-system, BlinkMacSystemFont, 'Noto Sans SC', sans-serif"
    fontSize: "13px"
    fontWeight: 380
    lineHeight: 1.5
  message:
    fontFamily: "'Segoe UI Variable', 'Segoe UI', -apple-system, BlinkMacSystemFont, 'Noto Sans SC', sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.8
  message-dark:
    fontFamily: "'Segoe UI Variable', 'Segoe UI', -apple-system, BlinkMacSystemFont, 'Noto Sans SC', sans-serif"
    fontSize: "14px"
    fontWeight: 380
    lineHeight: 1.8
  label:
    fontFamily: "'Segoe UI Variable', 'Segoe UI', -apple-system, BlinkMacSystemFont, 'Noto Sans SC', sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  label-dark:
    fontFamily: "'Segoe UI Variable', 'Segoe UI', -apple-system, BlinkMacSystemFont, 'Noto Sans SC', sans-serif"
    fontSize: "12px"
    fontWeight: 380
    lineHeight: 1.5
  code:
    fontFamily: "'Cascadia Code', 'SFMono-Regular', Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.7
  code-dark:
    fontFamily: "'Cascadia Code', 'SFMono-Regular', Consolas, monospace"
    fontSize: "12px"
    fontWeight: 380
    lineHeight: 1.7
  source:
    fontFamily: "'Cascadia Code', 'SFMono-Regular', Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.6
  source-dark:
    fontFamily: "'Cascadia Code', 'SFMono-Regular', Consolas, monospace"
    fontSize: "12px"
    fontWeight: 380
    lineHeight: 1.6
rounded:
  item: "4px"
  action: "6px"
  control: "8px"
  surface: "12px"
  pill: "999px"
spacing:
  "4": "4px"
  "6": "6px"
  "8": "8px"
  "10": "10px"
  "12": "12px"
  "16": "16px"
  "24": "24px"
  "32": "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.action}"
    padding: "7px 10px"
  button-secondary:
    backgroundColor: "{colors.sidebar}"
    textColor: "{colors.text}"
    rounded: "{rounded.action}"
    padding: "7px 10px"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.secondary}"
    typography: "{typography.label}"
    rounded: "{rounded.action}"
    padding: "7px 10px"
  button-icon:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.action}"
    padding: "6px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "9px 11px"
  select:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "8px 10px"
  navigation-item:
    backgroundColor: "transparent"
    textColor: "{colors.secondary}"
    rounded: "{rounded.control}"
    padding: "9px 10px"
  badge:
    backgroundColor: "{colors.hover}"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.item}"
    padding: "2px 5px"
  switch:
    backgroundColor: "{colors.line}"
    rounded: "{rounded.surface}"
    padding: "3px"
    width: "34px"
    height: "20px"
  reference-card:
    backgroundColor: "{colors.hover}"
    textColor: "{colors.secondary}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "7px 8px"
  genui-shell:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.surface}"
  genui-source-toggle:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.action}"
    padding: "4px"
    width: "24px"
    height: "24px"
---

# 设计系统：Better OMP Desktop

## Overview

**Creative North Star: "本地桌面开发助手"**

面向本地开发协作的桌面工作台，以浅灰绿色和深灰绿色承载持续操作与阅读。项目、会话和工作区工具形成稳定的导航，正文、代码与设置保留各自的阅读密度。

界面沿用系统字体和细线图标。绿色用于当前选择、主要动作与操作反馈，背景层次、细分隔线和紧凑圆角组织内容。明暗主题使用同一组语义角色，动效随外观设置及系统减少动态效果偏好调整。

**Key Characteristics:**

- 明暗主题共享语义颜色，分别维护字重与对比。
- 导航和操作区紧凑，消息正文与代码保留较松的行距。
- 内容依靠背景层次与细线组织，浮层使用统一阴影。
- 设置、引用和生成式UI复用主界面的控件与状态反馈。

提取依据为当前 `src/tokens.css`、全局样式、共用控件与设置/引用/旁问/生成式UI实现，并与 `.impeccable/review/` 中的明暗主题和窄窗口截图核对。顶部前置信息中的无前缀颜色与排版角色对应浅色主题，`dark-` 颜色及 `-dark` 排版角色对应深色主题；组件引用展示浅色角色，实际界面通过 CSS 语义变量切换主题。

## Colors

灰绿中性色形成背景和文字层次，绿色主色承载动作与当前状态。颜色名称沿用已实现的语义角色，具体值以顶部前置信息为准。

### Primary

- **主绿 / 浅叶绿**：`accent` / `dark-accent` 用于主要按钮、链接、运行中状态与选中控件；`on-accent` 承载主色背景上的内容。
- **主色浅底与边线**：`accent-soft`、`accent-line` 区分已选择的能力、组件和工具；`selected` 表示当前会话与选中区域。

### Neutral

- **主表面、抬升表面与侧栏**：`surface` 承载主工作区，`surface-raised` 承载输入框、菜单及生成界面，`sidebar` 承载项目与会话导航。
- **主文、次级说明与弱提示**：`text`、`secondary`、`muted` 对应内容、操作说明和辅助信息。弱提示仍承担可读信息。
- **边线与交互底色**：`line` 用于输入与结构边界，`line-soft` 用于分隔；`hover` 为悬停与轻量标签提供底色。
- **焦点与选段**：`focus`、`input-focus` 用于键盘焦点和打开的选择器，`selection` 用于文字选段。
- **内容背景**：用户消息、工具输出、代码分别使用 `user-message`、`tool-surface`、`code-surface`，保持内容类型的层次。

### 状态与差异

- **完成绿**：`success` 表示连接成功与完成反馈。
- **错误红**：`danger` 与 `error-surface` 配对呈现可处理的错误及对应操作。
- **改动底色**：`diff-added`、`diff-removed` 用于代码差异。生成式UI的警告色在跟随主题时使用现有主色回退。

## Typography

**界面字体：** Segoe UI Variable、Segoe UI，并依次回退到系统 UI、Noto Sans SC 和通用无衬线字体。
**代码字体：** Cascadia Code、SFMono-Regular、Consolas 和等宽字体。

系统字体覆盖中文界面、说明与长文本。界面文字紧凑，消息正文增加字号与行距；代码保留等宽对齐和独立滚动。标题与强调字重由主题调整：浅色普通/中等/强调/粗体依次为（400 / 500 / 560 / 650），深色为（380 / 480 / 540 / 630）。

### 层级

- **起始页标题**：对应 `display`，用于欢迎语；窄窗口按现有断点缩小。
- **分区标题**：对应 `headline`，用于设置分区；页面标题对应 `title`。
- **界面正文**：对应 `body`，用于导航、控件与设置项；辅助说明对应 `label`。
- **消息正文**：对应 `message`，用较松行距承载助手内容；消息内标题另采用已实现的（21 / 17 / 14px）层级。
- **代码与源码**：对应 `code` 和 `source`；源码区域保持原始缩进和换行。关键数值与用量采用等宽数字。
- **生成界面标题**：OpenUI 的一至四级标题使用（24 / 20 / 16 / 14px）；HTML 文档使用当前系统字体与文档内排版。

## Layout

主窗口由顶部原生窗口栏、左侧项目/会话导航与主工作区组成。桌面最小窗口为（880 × 640）；窗口栏高（36px）。常规侧栏宽（230px），在（1120px）与（960px）断点分别缩至（210px）和（190px）。主内容使用可收缩列，内部阅读区和工具面板分别滚动。

会话正文最大宽度为（790px），居中排列；滚动区采用稳定滚动条占位。消息输入区与正文共用居中的宽度关系，工具栏允许换行。用户消息靠右并限制为所在区域宽度的（94%）。设置采用左侧分类导航与右侧滚动内容：分类导航常规宽（180px），内容最大宽（850px），设置行使用（64px）最小高度与轻分隔线。

间距沿用顶部记录的已使用档位：小间距分隔图标、字段和标签，中间距组织控件与内容，较大间距分开分区和页面。引用默认以可收缩卡片换行；摘要占两行，文件名和来源在卡片内截断。旁问记录区滚动，输入区保持可见，长代码与表格在记录内部滚动。

在（620px）以下，侧栏隐藏、设置导航转为横向滚动、设置内容与正文收紧内边距。生成式UI与引用在（600px）断点进一步改为单列；生成界面的网格变为一列，内容内边距由（16px）降至（12px）。这些是现有布局规则，桌面仍以最小窗口尺寸为交付边界。

## Elevation & Depth

静态内容主要依靠相邻表面的明度、细边线与内嵌描边建立层次。菜单、选择器、命令弹窗和错误浮层使用统一的表面阴影；源码区、引用与普通设置项保持直接的内容层级。焦点通过内嵌一像素描边与半透明外圈表达，强制颜色模式改用系统焦点颜色。

阴影、焦点圈、进入与退出缓动的完整值位于 `.impeccable/design.json`，并继续以源 CSS 变量为实现依据。界面提供丰富、普通和减少动态效果三级设置；丰富模式补充轻微的位移、缩放与完成反馈，普通模式缩短设置组的反馈与展开时间，减少动态效果模式停用持续动画和控件变换。系统 `prefers-reduced-motion` 覆盖当前动画与过渡，保持静态状态信息。

## Shapes

小圆角用于条目、行内代码和标签，中等圆角用于按钮，控件圆角用于输入、引用与选择器，表面圆角用于输入区、菜单、弹窗和生成界面外壳。数值分别对应顶部的 `item`、`action`、`control` 和 `surface`。状态徽章采用胶囊形，复选框为小圆角方形，单选框为圆形。

图标以细线轮廓呈现，常见图标尺寸按所在操作区采用（12–16px），全局笔画宽度为（1.7）。窗口控制按钮保留平台窗口栏的直角形状。

## Components

### 按钮与图标动作

主要按钮使用主绿背景与主色上的文字，悬停降低亮度，按压轻微下移。次级按钮使用侧栏底色，安静按钮使用次级文字并在悬停时加入轻底色；当前工具通过主色浅底和主色文字表达。图标按钮采用透明底、紧凑内边距与小圆角，悬停显现底色。禁用按钮降低透明度，键盘焦点复用统一焦点圈。

消息复制操作在成功后短暂显示对勾（2500ms）。轮次信息与消息动作保持紧凑辅助层级，与正文阅读区域分开。

### 输入、选择器与选择控件

文本框使用主表面、内嵌细描边和控件圆角；占位文字为弱提示，光标为主色。自有选择器使用抬升表面，打开和悬停时加强描边；菜单选项有独立焦点与选中反馈，并限制菜单自身的滚动高度。

复选框与单选框尺寸为（16 × 16px），用主色表达选中；开关为（34 × 20px），圆形滑块为（14px）。控件由实际标签提供可访问名称，焦点和禁用状态沿用共用处理；强制颜色模式恢复系统复选框与单选框。

### 导航、标签与设置

项目、会话与工具导航以整行按钮呈现，当前会话使用选中背景；设置分类以轻底色标记当前项。导航中的长名称截断，侧栏会话搜索与列表共用紧凑密度。轻量标签使用悬停底色与条目圆角；生成式UI状态徽章使用胶囊边框和对应语义色。

设置项的名称、说明与实际控件并列，分组靠标题与细线组织。生成式UI能力和组件选择项以浅主色背景及主色边线表达已选择状态；组件按分类折叠并可搜索。总开关关闭后，所属设置保留显示并降低透明度，使用真实禁用状态。

### 引用、选段与连续旁问

引用卡片在输入区或消息正文附近呈现来源和摘要，可在自身区域移除。卡片间保持紧凑间距，宽度不足时换行；窄布局中铺满所在列。选段后出现小型动作条，提供引用、批注和旁问。

连续旁问复用主界面的按钮、输入框与颜色。来源、当前问题与回答分层呈现；记录区可滚动，输入区与发送动作保持独立。长回答中的代码与表格在自身区域滚动，错误和保存状态就地显示。

### 生成式UI

生成界面使用抬升表面、细边框和表面圆角。顶部紧凑工具栏显示 OpenUI Lang 或 HTML，并按配置显示生成状态与复验操作。OpenUI 内容使用（16px）内边距；HTML 文档在独立文档中显示，并同步已启用的主题、选择控件和动效设置。跟随主主题的界面沿用主应用的语义色；独立主题按已有实现单独呈现。

生成式UI总开关默认关闭。交互状态、实时进度预览、修复、诊断、复验、持久化和源码展示由独立设置控制。生成中按配置提供预览或等待状态；错误区域提供重新渲染与已启用的修复操作，并保留当前输入。

启用源码展示后，源码入口位于生成界面卡片外下方：图标操作区为（24 × 24px），图标为（12px），详情默认折叠，以标题和可访问名称提供“查看源码”。展开后的源码铺满所在内容列，高度限制为（clamp(120px, 40vh, 360px)），保留原始空白与缩进，并可独立滚动和获得键盘焦点。

## Do's and Don'ts

### Do

- Do：新增界面复用现有语义颜色、系统字体和圆角层级。
- Do：根据内容类型采用界面正文、消息正文或代码的排版角色。
- Do：可交互控件保留悬停、键盘焦点、选中和禁用反馈。
- Do：窄窗口中的工具栏与引用允许换行，长源码在自身区域滚动。
- Do：生成式UI跟随主题时沿用主语义色，源码入口位于界面卡片外下方并默认折叠。

### Don't

- Don't：把单张截图的具体色值当作明暗主题共用的色值。
- Don't：让长文件路径、引用摘要或代码把所在面板撑宽。
- Don't：用持续动画替代状态文字，减少动态效果设置下沿用静态反馈。
