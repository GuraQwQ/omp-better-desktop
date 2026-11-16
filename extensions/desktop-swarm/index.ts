import type { ExtensionAPI, ExtensionContext, ToolDefinition } from '@oh-my-pi/pi-coding-agent';
import { Runtime, bindings, roots } from './runtime';
import { TOOL_NAMES } from './types';

export default function desktopSwarm(api: ExtensionAPI) {
  let rootId: string | undefined;
  const get = async (context: ExtensionContext) => {
    if (context.agent.kind === 'sub') return bindings.get(context.agent.id);
    const id = context.sessionManager.getSessionId();
    if (rootId && rootId !== id) {
      const previous = roots.get(rootId);
      roots.delete(rootId);
      await (await previous)?.close();
    }
    rootId = id;
    let pending = roots.get(id);
    if (!pending) { pending = Runtime.open(api, context); roots.set(id, pending); pending.catch(() => roots.delete(id)); }
    const runtime = await pending;
    await runtime.attach(api, context, 'coordinator');
    return { runtime, name: 'coordinator' };
  };
  const type = api.typebox.Type;
  const run = (action: string) => async (_id: string, args: Record<string, unknown>, _signal: AbortSignal | undefined, _update: unknown, context: ExtensionContext) => {
    const binding = await get(context);
    if (!binding) throw Error('当前会话没有协作运行时。');
    const value = action === 'read' ? await binding.runtime.read(binding.name, args.since as number | undefined)
      : action === 'wait' ? await binding.runtime.wait(binding.name, args.since as number | undefined)
        : await binding.runtime.control({ action, args }, binding.name);
    const result = value && typeof value === 'object' && 'schemaVersion' in value
      ? { ...value, messages: undefined, lastSeq: (value as { messages?: { seq: number }[] }).messages?.at(-1)?.seq ?? 0 } : value;
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
  };
  for (const tool of [
    { name: 'swarm_post', description: '向协作公告板追加消息。recipients 指定成员名称；可用 @name 定向唤醒。delivery 默认 nudge 提醒成员，note 仅留言。完成后向负责人或验证者交付，返工直接联系作者。', parameters: type.Object({ text: type.String(), recipients: type.Optional(type.Array(type.String())), delivery: type.Optional(type.Union([type.Literal('note'), type.Literal('nudge')])) }), action: 'post' },
    { name: 'swarm_read', description: '读取单一公告板 since 之后的消息；序号是持久引用，压缩后也可回读。', parameters: type.Object({ since: type.Optional(type.Number()) }), action: 'read' },
    { name: 'swarm_status', description: '查看当前协作成员、状态和待处理数量。', parameters: type.Object({}), action: 'status' },
    { name: 'swarm_add', description: '添加稳定命名的 worker 或 verifier。任务应注明所有权、验收和交付对象。workspace=worktree 从已提交 HEAD 建独立工作副本，成果和目录会保留。', parameters: type.Object({ name: type.String(), role: type.Optional(type.Union([type.Literal('worker'), type.Literal('verifier')])), task: type.String(), model: type.Optional(type.String()), cwd: type.Optional(type.String()), workspace: type.Optional(type.Union([type.Literal('inherit'), type.Literal('worktree')])) }), action: 'add' },
    { name: 'swarm_wait', description: '确认已经处理的消息序号并进入等待。工具立即返回，随后结束本回合；匹配的新消息会启动下一回合，不需要轮询。', parameters: type.Object({ since: type.Optional(type.Number()) }), action: 'wait' },
  ]) api.registerTool({ ...tool, parameters: tool.parameters as ToolDefinition['parameters'], label: tool.name, defaultInactive: true, execute: run(tool.action) });

  api.registerCommand('desktop-swarm', {
    description: '桌面协作控制',
    handler: async (text, context) => {
      let requestId: string | undefined;
      try {
        const input = JSON.parse(text);
        requestId = typeof input.requestId === 'string' ? input.requestId : undefined;
        const binding = await get(context);
        if (!binding || binding.name !== 'coordinator') throw Error('桌面控制命令仅用于主会话。');
        await binding.runtime.control(input, 'coordinator', true);
        (binding.runtime as Runtime).publish(requestId);
      } catch (error) {
        const binding = await get(context).catch(() => undefined);
        if (binding) (binding.runtime as Runtime).publish(requestId, String(error instanceof Error ? error.message : error));
        else context.ui.setStatus('desktop:swarm', JSON.stringify({ requestId, error: String(error) }));
      }
    },
  });
  api.on('session_start', async (_event, context) => {
    const binding = await get(context);
    if (binding && binding.name !== 'coordinator') await binding.runtime.attach(api, context, binding.name);
  });
  api.on('session_switch', async (_event, context) => { await get(context); });
  api.on('before_agent_start', async (event, context) => {
    const binding = await get(context);
    if (!binding?.runtime.enabled) return;
    const coordination = binding.name === 'coordinator' ? '用户后续新约束或纠错优先覆盖旧任务。判断受影响成员后，用 swarm_post 定向 nudge 传达具体修订和验收标准；相关旧完成或验证结论须复验后再汇总。只有实际发布到公告板才算交付同伴。' : '';
    return { systemPrompt: [...event.systemPrompt, `你是协作成员 ${binding.name}。公告板是共同事实来源，工具结果中的 #seq 可回读。完成、阻塞或需要返工时，调用 swarm_post 向明确负责人交付，随后 swarm_wait 并结束回合。不要循环查询状态。verifier 只审查和验证，不修改业务源码。仅修改任务拥有的文件；跨边界依赖通过公告板协调。${coordination}`] };
  });
  api.on('agent_end', async (event, context) => {
    if (context.agent.kind !== 'main' || event.willContinue) return;
    const binding = await get(context);
    if (binding) await (binding.runtime as Runtime).coordinatorSettled(event.messages);
  });
  api.on('session_shutdown', async (_event, context) => {
    if (context.agent.kind !== 'main') return;
    const id = context.sessionManager.getSessionId();
    const runtime = await roots.get(id);
    roots.delete(id);
    await runtime?.close();
  });
}
