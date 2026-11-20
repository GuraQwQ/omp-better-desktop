import { request } from './bridge';
import { manage } from './management';

export type CommunityFormat = 'skill' | 'plugin' | 'mcp';
export interface CommunityEntry {
  id: 'ponytail' | 'grill-me' | 'codegraph';
  name: string;
  repository: string;
  formats: CommunityFormat[];
  description: [string, string];
  pluginHint?: [string, string];
}
export const communityEntries: CommunityEntry[] = [
  { id: 'ponytail', name: 'Ponytail', repository: 'https://github.com/DietrichGebert/ponytail', formats: ['plugin'], description: ['用最小完整改动解决问题，插件持续应用工作原则。', 'Solve the whole problem with the smallest change; the plugin keeps its working principles active.'] },
  { id: 'grill-me', name: 'grill-me', repository: 'https://github.com/mattpocock/skills', formats: ['skill', 'plugin'], description: ['通过逐步访谈澄清目标与约束，安装实际技能 grilling。', 'Clarify goals and constraints through an interview. Installs the grilling skill.'], pluginHint: ['插件格式安装 Matt Pocock 官方技能套件。', 'The plugin format installs the official Matt Pocock skills collection.'] },
  { id: 'codegraph', name: 'CodeGraph', repository: 'https://github.com/colbymchenry/codegraph', formats: ['mcp'], description: ['通过代码关系图定位符号与调用链。安装后在项目中创建索引。', 'Find symbols and call paths through a code graph. Create an index in your project after installation.'] },
];

export async function installCommunity(entry: CommunityEntry, format: CommunityFormat, sessionId: string, cwd: string): Promise<void> {
  const result = await request('community.install', { id: entry.id, format, cwd });
  if (format === 'skill') {
    if (!result.paths?.length) throw Error('安装未返回技能文件，请重试。');
    const found = await manage<{ items: { id: string; kind: string; path: string }[] }>(sessionId, 'imports', 'discover', { sources: [], paths: result.paths });
    const items = found.items.filter(item => item.kind === 'skill');
    if (items.length !== result.paths.length) throw Error('技能文件尚未准备完整，请重试。');
    await manage(sessionId, 'imports', 'install', { items });
    for (const item of items) await manage(sessionId, 'imports', 'enable', { id: item.id });
  } else if (format === 'plugin') {
    if (!result.installed) throw Error('插件尚未安装完成，请重试。');
  } else {
    if (!result.config) throw Error('安装未返回 MCP 配置，请重试。');
    const current = await manage<{ items: { name: string; command?: string; args?: string[] }[] }>(sessionId, 'mcp', 'list');
    const existing = current.items.find(item => item.name === 'codegraph');
    if (existing) {
      if (existing.command !== result.config.command || JSON.stringify(existing.args) !== JSON.stringify(result.config.args)) throw Error('已有同名 CodeGraph 配置，请先在 MCP 列表中核对或重命名。');
      await manage(sessionId, 'mcp', 'enable', { id: 'codegraph' });
      return;
    }
    await manage(sessionId, 'mcp', 'add', { name: 'codegraph', scope: 'user', config: result.config });
  }
}
