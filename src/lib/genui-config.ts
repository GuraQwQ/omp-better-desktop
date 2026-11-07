export type GenUIGroup = 'layout' | 'text' | 'forms' | 'tables' | 'charts' | 'maps' | 'math' | 'media';
export type GenUIField = { name: string; type: string; optional?: boolean };
export type GenUIComponent = { name: string; group: GenUIGroup; label: string; fields: GenUIField[] };
export const GENUI_GROUPS: Record<GenUIGroup, string> = {
  layout: '布局', text: '文本', forms: '表单', tables: '表格', charts: '图表', maps: '地图', math: '数学', media: '媒体',
};
const field = (name: string, type: string, optional = false): GenUIField => ({ name, type, optional });
export const GENUI_COMPONENTS: GenUIComponent[] = [
  { name: 'Col', group: 'layout', label: '纵向布局', fields: [field('children', 'children'), field('gap', 'number', true)] },
  { name: 'Row', group: 'layout', label: '横向布局', fields: [field('children', 'children'), field('gap', 'number', true)] },
  { name: 'Grid', group: 'layout', label: '网格', fields: [field('children', 'children'), field('columns', 'number', true), field('gap', 'number', true)] },
  { name: 'Card', group: 'layout', label: '卡片', fields: [field('children', 'children'), field('title', 'string', true)] },
  { name: 'Box', group: 'layout', label: '容器', fields: [field('children', 'children'), field('padding', 'number', true)] },
  { name: 'Divider', group: 'layout', label: '分隔线', fields: [] },
  { name: 'Spacer', group: 'layout', label: '间距', fields: [field('size', 'number', true)] },
  { name: 'Title', group: 'text', label: '标题', fields: [field('text', 'string'), field('level', 'number', true)] },
  { name: 'Text', group: 'text', label: '正文', fields: [field('text', 'string')] },
  { name: 'Caption', group: 'text', label: '说明', fields: [field('text', 'string')] },
  { name: 'Badge', group: 'text', label: '状态标签', fields: [field('text', 'string'), field('tone', 'neutral|success|warning|danger', true)] },
  { name: 'Markdown', group: 'text', label: 'Markdown', fields: [field('text', 'string')] },
  { name: 'Code', group: 'text', label: '代码', fields: [field('text', 'string'), field('language', 'string', true)] },
  { name: 'Link', group: 'text', label: '链接', fields: [field('label', 'string'), field('url', 'string')] },
  { name: 'List', group: 'text', label: '列表', fields: [field('items', 'strings')] },
  { name: 'Input', group: 'forms', label: '输入框', fields: [field('name', 'string'), field('label', 'string'), field('value', 'reactiveString', true), field('placeholder', 'string', true)] },
  { name: 'TextArea', group: 'forms', label: '多行输入', fields: [field('name', 'string'), field('label', 'string'), field('value', 'reactiveString', true)] },
  { name: 'NumberInput', group: 'forms', label: '数字输入', fields: [field('name', 'string'), field('label', 'string'), field('value', 'reactiveNumber', true)] },
  { name: 'Select', group: 'forms', label: '选择框', fields: [field('name', 'string'), field('label', 'string'), field('options', 'strings'), field('value', 'reactiveString', true)] },
  { name: 'Checkbox', group: 'forms', label: '复选框', fields: [field('name', 'string'), field('label', 'string'), field('value', 'reactiveBoolean', true)] },
  { name: 'Slider', group: 'forms', label: '滑块', fields: [field('name', 'string'), field('label', 'string'), field('min', 'number'), field('max', 'number'), field('value', 'reactiveNumber', true)] },
  { name: 'DatePicker', group: 'forms', label: '日期', fields: [field('name', 'string'), field('label', 'string'), field('value', 'reactiveString', true)] },
  { name: 'Button', group: 'forms', label: '按钮', fields: [field('label', 'string'), field('action', 'action', true)] },
  { name: 'Form', group: 'forms', label: '表单', fields: [field('children', 'children'), field('name', 'string', true)] },
  { name: 'Table', group: 'tables', label: '表格', fields: [field('columns', 'strings'), field('rows', 'rows'), field('caption', 'string', true)] },
  { name: 'LineChart', group: 'charts', label: '折线图', fields: [field('labels', 'strings'), field('values', 'numbers'), field('title', 'string', true)] },
  { name: 'BarChart', group: 'charts', label: '柱状图', fields: [field('labels', 'strings'), field('values', 'numbers'), field('title', 'string', true)] },
  { name: 'PieChart', group: 'charts', label: '饼图', fields: [field('labels', 'strings'), field('values', 'numbers'), field('title', 'string', true)] },
  { name: 'Map', group: 'maps', label: '地图', fields: [field('longitude', 'number'), field('latitude', 'number'), field('zoom', 'number', true), field('label', 'string', true)] },
  { name: 'Math', group: 'math', label: '公式', fields: [field('expression', 'string'), field('display', 'boolean', true)] },
  { name: 'Image', group: 'media', label: '图片', fields: [field('url', 'string'), field('alt', 'string')] },
  { name: 'Video', group: 'media', label: '视频', fields: [field('url', 'string'), field('title', 'string')] },
  { name: 'Audio', group: 'media', label: '音频', fields: [field('url', 'string'), field('title', 'string')] },
];
export const GENUI_FEATURES = {
  theme: { label: '跟随明暗主题', enabled: true, hint: '用宿主语义颜色呈现界面。' },
  streaming: { label: '跟随生成进度实时预览', enabled: false, hint: '关闭时等待界面完整；开启后随源码增量实时更新。' },
  state: { label: '本地交互状态', enabled: true, hint: '输入和筛选在本地更新。' },
  actions: { label: '动作回传', enabled: true, hint: '允许按钮把用户意图发送到当前会话。' },
  html: { label: 'HTML 文档', enabled: true, hint: '在独立文档中呈现 HTML、CSS 和 SVG。' },
  scripts: { label: 'HTML 脚本', enabled: true, hint: '源码接收完成后运行文档脚本。' },
  hostCalls: { label: '宿主能力调用', enabled: true, hint: '允许使用下方选中的项目读取能力。' },
  diagnostics: { label: '详细诊断', enabled: false, hint: '显示结构化的组件和能力错误。' },
  repair: { label: '模型修复', enabled: false, hint: '可将错误和对应源码交给当前会话修复。' },
  autoRepair: { label: '自动修复', enabled: false, hint: '同一生成目标最多自动尝试两次，可随时取消。' },
  verify: { label: '渲染复验', enabled: false, hint: '检查界面的空白、溢出与表单有效性。' },
  persistence: { label: '持久化状态', enabled: false, hint: '保存源码与输入状态，重开后恢复。' },
  showSource: { label: '显示源码查看按钮', labelEn: 'Show source viewer button', enabled: false, hint: '在界面下方留白显示小图标，原位展开源码。', hintEn: 'Show a small icon below the interface to expand its source.' },
} as const;
export type GenUIFeature = keyof typeof GENUI_FEATURES;
export const GENUI_CAPABILITIES = [
  { name: 'workspace.files', label: '列出项目文件', args: '{}' },
  { name: 'workspace.read', label: '读取项目文本', args: '{path:string}' },
  { name: 'workspace.diff', label: '读取 Git 改动', args: '{}' },
  { name: 'workspace.search', label: '搜索项目文本', args: '{query:string,limit?:number}' },
] as const;
export interface GenUIConfiguration {
  enabled: boolean;
  components: string[];
  features: Record<GenUIFeature, boolean>;
  capabilities: string[];
}
export function normalizeGenUIConfiguration(value?: unknown): GenUIConfiguration {
  const input = value && typeof value === 'object' ? value as Partial<GenUIConfiguration> : {};
  const names = new Set(GENUI_COMPONENTS.map(component => component.name));
  const capabilityNames = new Set<string>(GENUI_CAPABILITIES.map(capability => capability.name));
  return {
    enabled: input.enabled === true,
    components: Array.isArray(input.components) ? [...new Set(input.components)].filter(name => names.has(name)) : GENUI_COMPONENTS.filter(component => !['charts', 'maps', 'math', 'media'].includes(component.group)).map(component => component.name),
    features: Object.fromEntries(Object.entries(GENUI_FEATURES).map(([name, feature]) => [name, typeof input.features?.[name as GenUIFeature] === 'boolean' ? input.features[name as GenUIFeature] : feature.enabled])) as GenUIConfiguration['features'],
    capabilities: Array.isArray(input.capabilities) ? [...new Set(input.capabilities)].filter(name => capabilityNames.has(name)) : GENUI_CAPABILITIES.map(capability => capability.name),
  };
}
export const genUIConfigurationKey = (configuration: unknown) => JSON.stringify(normalizeGenUIConfiguration(configuration));
export function genUIRuntimeConfigurationKey(configuration: unknown): string {
  const config = normalizeGenUIConfiguration(configuration);
  const { showSource, ...features } = config.features;
  return JSON.stringify({ ...config, features });
}
export function exposedGenUIFields(component: GenUIComponent, config: GenUIConfiguration): GenUIField[] {
  return component.fields.filter(prop => prop.type !== 'action' || config.features.actions || config.features.state).map(prop => config.features.state ? prop : { ...prop, type: prop.type.replace(/^reactive/, '').toLowerCase() });
}
export function buildGenUIInstructions(value: unknown): string {
  const config = normalizeGenUIConfiguration(value);
  if (!config.enabled) return '';
  const components = GENUI_COMPONENTS.filter(component => config.components.includes(component.name));
  const lines = ['生成式界面：需要交互界面时，在 openui 代码围栏内输出 OpenUI Lang；普通解释继续使用 Markdown。', 'OpenUI 由 root = Component(...) 开始，每个语句独立一行。位置参数严格按以下签名排列，可引用其他语句名。'];
  for (const component of components) lines.push(`${component.name}(${exposedGenUIFields(component, config).map(prop => `${prop.name}${prop.optional ? '?' : ''}:${prop.type}`).join(', ')})`);
  if (config.features.state) lines.push('本地状态用 $变量声明并传入 reactive 参数；例如 $name = ""，input = Input("name", "姓名", $name)。');
  if (config.features.actions) lines.push('按钮动作可用 @ToAssistant("用户意图")；在当前用户点击后，将表单状态返回会话。');
  if (config.features.state) lines.push('本地变量可使用 @Set($变量, 值) 与 @Reset($变量)，按钮点击只在本地更新。');
  if (config.features.hostCalls) for (const capability of GENUI_CAPABILITIES.filter(item => config.capabilities.includes(item.name))) lines.push(`data = Query("${capability.name}", ${capability.args}, 默认值) 读取宿主数据，可用 @Run(data) 按需重新读取。`);
  if (config.features.html) lines.push('需要自由 HTML/CSS/SVG 时，使用 genui-html 代码围栏。文档继承语义颜色 CSS 变量。');
  if (config.features.html && config.features.scripts) {
    lines.push('HTML 脚本在源码结束后执行，使用内联 script；绑定事件使用 addEventListener。');
    if (config.features.state) lines.push('通过 window.ompUI.getState()/setState(对象) 更新本地字段，表单通过 name 属性恢复输入。');
    if (config.features.hostCalls && config.capabilities.length) lines.push('通过 window.ompUI.call(能力名, 参数) 使用已公布能力。');
    if (config.features.actions) lines.push('通过 window.ompUI.sendMessage(文本) 回传用户意图。');
  }
  if (config.features.theme) lines.push('颜色使用 --genui-surface、--genui-text、--genui-muted、--genui-border、--genui-accent、--genui-success、--genui-warning、--genui-danger。');
  return lines.join('\n');
}
