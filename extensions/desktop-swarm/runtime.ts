import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { AgentSession, ExtensionAPI, ExtensionContext } from '@oh-my-pi/pi-coding-agent';
import { Store, rootKey } from './store';
import { STATUS_KEY, TOOL_NAMES, type Binding, type BoardMessage, type Control, type LiveMember, type Member, type Snapshot } from './types';

const sharedKey = Symbol.for('omp.desktop.swarm.runtime.v1');
const shared = Reflect.get(globalThis, sharedKey) as { bindings: Map<string, Binding>; roots: Map<string, Promise<Runtime>> } | undefined
  ?? { bindings: new Map<string, Binding>(), roots: new Map<string, Promise<Runtime>>() };
Reflect.set(globalThis, sharedKey, shared);
export const bindings = shared.bindings;
export const roots = shared.roots;
const text = (value: unknown, label: string) => { if (typeof value !== 'string' || !value.trim()) throw Error(`${label}不能为空。`); return value.trim(); };
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
const modelName = (model: ExtensionContext['model']) => model ? `${model.provider}/${model.id}` : '';
const messageText = (message: { content?: unknown }) => Array.isArray(message.content)
  ? message.content.filter(block => block.type === 'text').map(block => block.text).join('\n') : typeof message.content === 'string' ? message.content : '';

export class Runtime {
  readonly registry;
  private readonly live = new Map<string, LiveMember>();
  private readonly active = new Map<string, Promise<void>>();
  private readonly workerApis = new Map<string, ExtensionAPI>();
  private readonly adding = new Set<string>();
  private parentTools: string[] = [];
  private closing = false;
  private coordinatorBatch = 0;
  private coordinatorSent = false;
  private readonly coordinatorDeliveries = new Map<number, string>();
  private readonly deliveredHeads = new Map<string, number>();
  private readonly memberDeliveries = new Map<string, Map<number, string>>();
  private readonly nudges = new Map<string, Promise<void>>();
  private pumpScheduled = false;
  private constructor(private api: ExtensionAPI, private context: ExtensionContext, readonly store: Store, readonly rootSessionId: string) {
    this.registry = new api.pi.AgentRegistry();
    this.parentTools = api.getActiveTools().filter(name => !TOOL_NAMES.includes(name as typeof TOOL_NAMES[number]));
  }

  static async open(api: ExtensionAPI, context: ExtensionContext) {
    const base = process.env.OMP_DESKTOP_SWARM_DIR;
    if (!base || !path.isAbsolute(base)) throw Error('桌面协作数据目录未配置。');
    const id = context.sessionManager.getSessionId();
    const now = Date.now();
    const store = await Store.open(base, id, {
      schemaVersion: 1, enabled: process.env.OMP_DESKTOP_SWARM_ENABLED === '1', title: '', task: '', revision: 0,
      messages: [], pending: 0, running: 0, updatedAt: now,
      members: [{ id: 'coordinator', name: 'coordinator', role: 'coordinator', status: 'idle', model: modelName(context.model), cwd: context.cwd, task: '', lastReadSeq: 0, lastPostSeq: 0 }],
    });
    if (process.env.OMP_DESKTOP_SWARM_ENABLED === '0' && store.snapshot().enabled) await store.change(state => { state.snapshot.enabled = false; });
    return new Runtime(api, context, store, id);
  }

  get enabled() { return this.store.snapshot().enabled && !this.closing; }
  snapshot() { return { ...this.store.snapshot(), rootSessionId: this.rootSessionId }; }
  publish(requestId?: string, error?: string) {
    this.context.ui.setStatus(STATUS_KEY, JSON.stringify({ ...(requestId ? { requestId } : {}), rootSessionId: this.rootSessionId, snapshot: this.snapshot(), ...(error ? { error } : {}) }));
  }
  private async change(update: Parameters<Store['change']>[0]) { const snapshot = await this.store.change(update); this.publish(); return snapshot; }
  private member(name: string) { const member = this.snapshot().members.find(value => value.name === name || value.id === name); if (!member) throw Error(`未找到协作成员：${name}`); return member; }

  async attach(api: ExtensionAPI, context: ExtensionContext, name: string) {
    if (name === 'coordinator') { this.api = api; this.context = context; }
    else this.workerApis.set(name, api);
    const selected = api.getActiveTools();
    const own = new Set<string>(TOOL_NAMES);
    if (name === 'coordinator') this.parentTools = selected.filter(name => !own.has(name));
    const next = this.enabled && this.parentTools.length > 0 ? [...new Set([...selected, ...TOOL_NAMES])] : selected.filter(name => !own.has(name));
    if (next.length !== selected.length || next.some((name, index) => name !== selected[index])) await api.setActiveTools(next);
    if (name === 'coordinator') {
      const member = this.member(name), model = modelName(context.model);
      if (member.cwd !== context.cwd || member.model !== model) await this.change(state => { state.snapshot.members[0].cwd = context.cwd; state.snapshot.members[0].model = model; });
      this.schedule();
    }
  }

  async control(input: Control, actor = 'coordinator', fromUser = false): Promise<unknown> {
    if (this.closing) throw Error('协作会话已关闭，请切回对应会话后重试。');
    const args = input.args ?? {};
    if (!input || typeof input.action !== 'string' || !args || typeof args !== 'object' || Array.isArray(args)) throw Error('协作控制参数无效。');
    if (input.action === 'status') return this.snapshot();
    if (input.action === 'read') return this.read(actor, args.since as number | undefined);
    if (actor !== 'coordinator' && !['post', 'add'].includes(input.action)) throw Error('成员仅可发布消息、读取公告板和派生明确任务。');
    if (input.action === 'enable' || input.action === 'create') {
      if (input.action === 'create' && args.title !== undefined) text(args.title, '协作标题');
      if (input.action === 'create') {
        const goal = typeof args.task === 'string' && args.task.trim() ? args.task.trim() : text(args.title, '协作目标');
        const title = typeof args.title === 'string' ? args.title.trim() : goal;
        await this.change(state => {
          if (state.snapshot.title) {
            if (state.snapshot.title !== title || state.snapshot.task !== goal) throw Error('当前会话已建立协作，请通过公告板补充目标或恢复原协作。');
            return;
          }
          state.snapshot.enabled = true;
          state.snapshot.title = title;
          state.snapshot.task = goal; state.snapshot.members[0].task = goal;
          this.append(state.snapshot, 'user', ['coordinator'], `协作目标：${goal}\n请按实际需要拆分互不冲突的任务，使用 swarm_add 创建稳定命名成员，安排 verifier 审查；通过公告板直接协调返工并汇总实际交付。`);
        });
      }
      else await this.change(state => { state.snapshot.enabled = true; });
      await this.attach(this.api, this.context, 'coordinator');
      this.schedule();
      return this.snapshot();
    }
    if (input.action === 'disable') {
      await this.change(state => { state.snapshot.enabled = false; });
      this.coordinatorBatch = 0;
      this.coordinatorSent = false;
      this.coordinatorDeliveries.clear();
      await this.change(state => { state.snapshot.members[0].status = 'idle'; });
      await this.stop();
      await this.attach(this.api, this.context, 'coordinator');
      return this.snapshot();
    }
    if (input.action === 'stop') { await this.stop(this.target(args)); return this.snapshot(); }
    if (input.action === 'resume') {
      const target = this.target(args);
      if (target === 'coordinator') {
        if (this.member(target).status === 'working') return this.snapshot();
        this.coordinatorBatch = 0;
        this.coordinatorSent = false;
        this.coordinatorDeliveries.clear();
        await this.change(state => { state.snapshot.members[0].status = 'waiting'; delete state.snapshot.members[0].error; });
        this.schedule(); return this.snapshot();
      }
      const targets = this.snapshot().members.filter(member => member.role !== 'coordinator' && (!target || member.name === target));
      if (target && targets.length === 0) this.member(target);
      for (const member of targets) {
        if (typeof args.model === 'string') this.resolveModel(args.model);
        if (member.status === 'working') continue;
        await this.stop(member.name);
        await this.change(state => {
          const value = state.snapshot.members.find(value => value.name === member.name)!;
          value.status = 'waiting'; delete value.error;
          if (typeof args.model === 'string') value.model = args.model;
        });
      }
      this.schedule();
      return this.snapshot();
    }
    if (!this.enabled) throw Error('请先启用协作。');
    if (input.action === 'add') {
      const name = text(args.name, '成员名称').toLowerCase();
      if (!/^[a-z][a-z0-9_-]{0,47}$/.test(name) || ['coordinator', 'all'].includes(name)) throw Error('成员名称须以英文字母开头，使用字母、数字、横杠或下划线，最长48位。');
      const role = args.role ?? 'worker';
      if (role !== 'worker' && role !== 'verifier') throw Error('成员角色须为 worker 或 verifier。');
      const task = text(args.task, '成员任务');
      if (this.snapshot().members.some(member => member.name === name)) throw Error(`成员名称已存在：${name}。请恢复原成员或选择新名称。`);
      let cwd = path.resolve(typeof args.cwd === 'string' ? args.cwd : this.member(actor).cwd);
      if (!(await fs.stat(cwd)).isDirectory()) throw Error('成员工作区必须是现有目录。');
      const workspace = args.workspace ?? 'inherit';
      if (workspace !== 'inherit' && workspace !== 'worktree') throw Error('工作区模式须为 inherit 或 worktree。');
      const model = typeof args.model === 'string' ? args.model : modelName(this.context.model);
      this.resolveModel(model);
      if (this.adding.has(name)) throw Error(`成员 ${name} 正在创建，请等待本次结果。`);
      this.adding.add(name);
      try {
        const isolated = workspace === 'worktree' ? await this.worktree(name, cwd) : undefined;
        if (isolated) cwd = isolated.cwd;
        await this.change(state => {
          if (!this.enabled || !state.snapshot.enabled) throw Error('协作已暂停，请恢复后添加成员。');
          if (state.snapshot.members.some(member => member.name === name)) throw Error(`成员名称已存在：${name}。请恢复原成员或选择新名称。`);
          state.snapshot.members.push({ id: `swarm-${rootKey(this.context.sessionManager.getSessionId())}-${name}`, name, role, task, cwd, model, workspace, ...(isolated ? { baseCwd: isolated.baseCwd, baseRevision: isolated.baseRevision } : {}), status: 'waiting', lastReadSeq: 0, lastPostSeq: 0 });
          this.append(state.snapshot, actor, [name], task);
        });
      } finally { this.adding.delete(name); }
      this.schedule(); return this.snapshot();
    }
    if (input.action === 'post') {
      const body = text(args.text, '消息');
      const sender = fromUser ? 'user' : actor;
      const delivery = args.delivery ?? 'nudge';
      if (delivery !== 'note' && delivery !== 'nudge') throw Error('消息方式须为 note 或 nudge。');
      let names: string[];
      if (args.recipients !== undefined) {
        if (!Array.isArray(args.recipients) || args.recipients.some(name => typeof name !== 'string')) throw Error('收件人须为成员名称列表。');
        names = args.recipients as string[];
      } else names = [...body.matchAll(/@([a-zA-Z][a-zA-Z0-9_-]*)/g)].map(match => match[1].toLowerCase());
      const recipients = [...new Set(names.flatMap(name => name === 'all' ? this.snapshot().members.map(member => member.name).filter(name => name !== sender) : [this.member(name).name]))];
      await this.change(state => {
        if (!this.enabled || !state.snapshot.enabled) throw Error('协作已暂停，消息尚未发布。');
        this.append(state.snapshot, sender, recipients, body, delivery);
      });
      if (fromUser && delivery === 'nudge') await Promise.all(recipients.map(name => this.nudge(name)));
      this.schedule(); return this.snapshot();
    }
    throw Error(`未知协作操作：${input.action}`);
  }

  private target(args: Record<string, unknown>) {
    const value = args.memberId ?? args.name;
    return value === undefined ? undefined : this.member(text(value, '成员')).name;
  }
  private async git(cwd: string, args: string[]) {
    return await new Promise<string>((resolve, reject) => {
      const child = spawn('git', args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '', stderr = '';
      child.stdout.on('data', chunk => { stdout += chunk; });
      child.stderr.on('data', chunk => { stderr += chunk; });
      child.once('error', reject);
      child.once('exit', code => code === 0 ? resolve(stdout.trim()) : reject(Error(stderr.trim() || `Git 命令失败：${args[0]}`)));
    });
  }
  private async worktree(name: string, source: string) {
    const baseCwd = await this.git(source, ['rev-parse', '--show-toplevel']).catch(() => { throw Error('该目录不是 Git 工作区，请选择现有成员目录或使用继承模式。'); });
    const revision = await this.git(baseCwd, ['rev-parse', 'HEAD']);
    const cwd = path.join(this.store.directory, 'workspaces', name);
    const registered = async () => (await this.git(baseCwd, ['worktree', 'list', '--porcelain', '-z'])).split('\0').some(field => field.startsWith('worktree ') && path.resolve(field.slice(9)) === path.resolve(cwd));
    if (!await registered()) {
      const exists = await fs.stat(cwd).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
      if (exists) throw Error('成员工作副本目录已存在但未登记为 Git worktree，已保留目录；请选择其它名称或核对现有目录。');
      await fs.mkdir(path.dirname(cwd), { recursive: true });
      try { await this.git(baseCwd, ['worktree', 'add', '--detach', cwd, revision]); }
      catch (error) { if (!await registered()) throw error; }
    }
    const actual = await this.git(cwd, ['rev-parse', 'HEAD']);
    return { cwd, baseCwd, baseRevision: actual };
  }
  private append(snapshot: Snapshot, sender: string, recipients: string[], body: string, delivery: 'note' | 'nudge' = 'nudge') {
    const seq = (snapshot.messages.at(-1)?.seq ?? 0) + 1;
    snapshot.messages.push({ seq, sender, recipients, text: body, createdAt: Date.now(), delivery });
    const member = snapshot.members.find(member => member.name === sender);
    if (member) member.lastPostSeq = seq;
  }

  async read(name: string, since = 0) {
    if (!Number.isSafeInteger(since) || since < 0) throw Error('公告板游标须为非负整数。');
    const snapshot = this.snapshot();
    const messages = snapshot.messages.filter(message => message.seq > since);
    const head = messages.at(-1)?.seq ?? snapshot.messages.at(-1)?.seq ?? 0;
    await this.change(state => { state.snapshot.members.find(member => member.name === name)!.lastReadSeq = Math.max(this.member(name).lastReadSeq, head); });
    return messages;
  }

  async wait(name: string, since?: number) {
    const member = this.member(name);
    if (since !== undefined && (!Number.isSafeInteger(since) || since < 0 || since > member.lastReadSeq)) throw Error('等待游标必须是实际已读的消息序号。');
    return { waiting: true, lastReadSeq: member.lastReadSeq, pending: this.store.pending(name).filter(message => message.delivery !== 'note' && message.seq > (since ?? member.lastReadSeq)).length, instruction: '结束本回合。新的提醒会自动唤醒，无需轮询。' };
  }

  private schedule() {
    if (this.pumpScheduled || !this.enabled) return;
    this.pumpScheduled = true;
    queueMicrotask(() => {
      this.pumpScheduled = false;
      if (!this.enabled) return;
      for (const member of this.snapshot().members) {
        if (!['idle', 'waiting'].includes(member.status) || !this.store.pending(member.name).some(message => message.delivery !== 'note')) continue;
        if (member.name === 'coordinator') { void this.wakeCoordinator().catch(error => this.fail('coordinator', error)); continue; }
        if (this.active.has(member.name)) continue;
        const run = Promise.resolve().then(() => this.run(member.name)).catch(error => this.fail(member.name, error)).finally(() => { this.active.delete(member.name); this.deliveredHeads.delete(member.name); this.memberDeliveries.delete(member.name); this.schedule(); });
        this.active.set(member.name, run);
      }
    });
  }

  private resolveModel(selector: string) {
    const slash = selector.indexOf('/');
    const model = slash > 0 ? this.context.modelRegistry.find(selector.slice(0, slash), selector.slice(slash + 1)) : undefined;
    if (!model) throw Error(`模型不可用：${selector || '未选择模型'}。请刷新模型目录或指定可用型号。`);
    return model;
  }

  private policy() {
    const own = new Set<string>(TOOL_NAMES);
    this.parentTools = this.api.getActiveTools().filter(name => !own.has(name));
    return JSON.stringify([this.context.modelRegistry.mirrorInputs().settings?.revision, [...this.parentTools].sort()]);
  }

  private async createSession(member: Member): Promise<LiveMember> {
    const policy = this.policy();
    const sdk = this.api.pi;
    const owner = this.context.modelRegistry;
    const inputs = owner.mirrorInputs();
    const sourceSettings = inputs.settings ?? await sdk.Settings.loadReadOnly({ cwd: member.cwd });
    const settings = (await sourceSettings.cloneForCwd(member.cwd)).overlay({ 'task.maxRecursionDepth': 0, 'async.enabled': false });
    const mirror = new sdk.ModelRegistry(owner.authStorage, inputs.modelsPath, { ...inputs, settings, owner });
    const subscription = owner.subscribeMirror(batch => mirror.applyMirrorBatch(batch));
    let manager: AgentSession['sessionManager'] | undefined;
    let createdSession: AgentSession | undefined;
    try {
      mirror.applyMirrorBatch(subscription.snapshot);
      const directory = path.join(this.store.directory, 'members', member.name);
      if (!(await fs.stat(member.cwd)).isDirectory()) throw Error('成员工作区已不可用，请恢复原目录后重试。');
      await fs.mkdir(directory, { recursive: true });
      manager = member.sessionFile
        ? await sdk.SessionManager.open(member.sessionFile, directory, undefined, { initialCwd: member.cwd, suppressBreadcrumb: true, throwIfMissing: true })
        : sdk.SessionManager.create(member.cwd, directory);
      bindings.set(member.id, { runtime: this, name: member.name });
      const excluded = new Set(['task', 'wait', ...TOOL_NAMES, ...(member.role === 'verifier' ? ['edit', 'write', 'ast_edit', 'rewind', 'new_context'] : [])]);
      const tools = this.parentTools.filter(name => !excluded.has(name));
      const created = await sdk.createAgentSession({
        cwd: member.cwd, agentDir: settings.getAgentDir(), settings, modelRegistry: mirror, authStorage: owner.authStorage,
        model: this.resolveModel(member.model), agentRegistry: this.registry, agentId: member.id, agentDisplayName: member.name,
        agentName: member.role, parentAgentId: 'coordinator', parentTaskPrefix: member.id, taskDepth: 1, spawns: '',
        bindProcessState: false, sessionManager: manager, disableExtensionDiscovery: true,
        additionalExtensionPaths: [fileURLToPath(new URL('./index.ts', import.meta.url))], toolNames: tools,
        enableMCP: false, enableLsp: false, enableIrc: false,
        appendSystemPrompt: `协作身份：${member.name}；角色：${member.role}。总目标：${this.snapshot().task}。你的任务：${member.task}。工作区：${member.cwd}。所有同伴消息通过 swarm_post，不能使用原生 task 或 agent://。`,
      });
      const session = created.session;
      createdSession = session;
      created.setToolUIContext(this.context.ui, this.context.hasUI);
      this.initializeWorker(session);
      await session.extensionRunner?.emit({ type: 'session_start' });
      await manager.ensureOnDisk();
      const sessionFile = manager.getSessionFile();
      await this.change(state => { state.snapshot.members.find(value => value.name === member.name)!.sessionFile = sessionFile; });
      const live = { session, registry: mirror, unsubscribe: subscription.unsubscribe, policy };
      this.live.set(member.name, live);
      return live;
    } catch (error) {
      bindings.delete(member.id); subscription.unsubscribe();
      if (createdSession) await createdSession.dispose();
      else await manager?.close();
      throw error;
    }
  }

  private initializeWorker(session: AgentSession) {
    const runner = session.extensionRunner;
    if (!runner) throw Error('成员协作扩展未加载。');
    runner.initialize({
      sendMessage: (message, options) => { void session.sendCustomMessage(message, options).catch(error => this.fail(this.memberById(session).name, error)); },
      sendUserMessage: (content, options) => session.sendUserMessage(content, options),
      appendEntry: (type, data) => { session.sessionManager.appendCustomEntry(type, data); },
      setLabel: (target, label) => { session.sessionManager.appendLabelChange(target, label); },
      getActiveTools: () => session.getEnabledToolNames(), getAllTools: () => session.getAllToolInfos(),
      setActiveTools: names => session.setActiveToolsByName(names), getCommands: () => [],
      setModel: async model => { await session.setModelTemporary(model); return true; },
      getThinkingLevel: () => session.thinkingLevel, setThinkingLevel: level => session.setThinkingLevel(level),
      getSessionName: () => session.sessionManager.getSessionName(), setSessionName: async name => { await session.sessionManager.setSessionName(name, 'user'); },
    }, {
      getModel: () => session.model, isIdle: () => !session.isStreaming, abort: () => { void session.abort(); },
      hasPendingMessages: () => session.queuedMessageCount > 0, shutdown: () => { void session.abort(); },
      getContextUsage: () => session.getContextUsage(), getSystemPrompt: () => session.systemPrompt,
      compact: async () => { await session.compact(); },
    }, undefined, this.context.ui, 'rpc');
    runner.onError(error => { void this.fail(this.memberById(session).name, Error(error.error)); });
  }

  private memberById(session: AgentSession) { return this.snapshot().members.find(member => member.id === session.getAgentId())!; }
  private render(messages: BoardMessage[]) { return messages.map(message => `#${message.seq} ${message.sender} → ${message.recipients.join(', ')}\n${message.text}`).join('\n\n'); }
  private coordinatorBody(messages: BoardMessage[]) { return `协作公告板增量（投递 ${randomUUID()}）：\n${this.render(messages)}`; }
  private consumedHead(deliveries: Map<number, string>, messages: { role: string; content?: unknown }[], initial = 0) {
    let head = initial;
    const lastAssistant = messages.findLastIndex(message => message.role === 'assistant');
    if (lastAssistant < 0) return head;
    const received = messages.slice(0, lastAssistant);
    for (const [seq, body] of [...deliveries].sort(([left], [right]) => left - right)) {
      if (!received.some(message => messageText(message).includes(body))) break;
      head = seq;
    }
    return head;
  }

  private nudge(name: string) {
    const previous = this.nudges.get(name) ?? Promise.resolve();
    const pending = previous.then(async () => {
      const member = this.member(name);
      if (!this.enabled || ['stopped', 'blocked'].includes(member.status)) return;
      if (name === 'coordinator' ? this.context.isIdle() : member.status !== 'working') return;
      const after = name === 'coordinator' ? this.coordinatorBatch : this.deliveredHeads.get(name);
      if (after === undefined || (name !== 'coordinator' && !after)) return;
      const batch = this.store.pending(name).filter(message => message.seq > after);
      if (!batch.some(message => message.delivery !== 'note')) return;
      const head = batch.at(-1)!.seq;
      if (name === 'coordinator') {
        this.coordinatorBatch = head;
        await this.change(state => {
          const value = state.snapshot.members[0];
          if (this.enabled && state.snapshot.enabled && !['stopped', 'blocked'].includes(value.status)) { value.status = 'working'; value.lastReadSeq = Math.max(value.lastReadSeq, head); }
        });
        if (!this.enabled || this.coordinatorBatch !== head || this.member(name).status !== 'working') return;
        const body = this.coordinatorBody(batch);
        this.coordinatorDeliveries.set(head, body);
        this.coordinatorSent = true;
        try {
          await this.api.sendUserMessage(body, { attribution: 'user' });
        } catch (error) { this.coordinatorDeliveries.delete(head); this.coordinatorBatch = Math.max(0, ...this.coordinatorDeliveries.keys()); this.coordinatorSent = this.coordinatorBatch > 0; throw error; }
        return;
      } else {
        const live = this.live.get(name);
        if (!live) return;
        const body = this.coordinatorBody(batch);
        if (!await live.session.joinActiveTurn(body, undefined, { queue: 'steering' })) return;
        this.memberDeliveries.get(name)?.set(head, body);
        this.deliveredHeads.set(name, Math.max(this.deliveredHeads.get(name) ?? 0, head));
      }
      await this.change(state => {
        const member = state.snapshot.members.find(member => member.name === name)!;
        if (this.enabled && state.snapshot.enabled && !['stopped', 'blocked'].includes(member.status)) { member.status = 'working'; member.lastReadSeq = Math.max(member.lastReadSeq, head); }
      });
    });
    this.nudges.set(name, pending);
    return pending.finally(() => { if (this.nudges.get(name) === pending) this.nudges.delete(name); });
  }

  private async run(name: string) {
    if (!this.enabled) return;
    const member = this.member(name);
    if (!['waiting', 'idle'].includes(member.status)) return;
    const batch = this.store.pending(name);
    if (!batch.some(message => message.delivery !== 'note')) return;
    const head = batch.at(-1)!.seq;
    let started = false;
    await this.change(state => {
      const value = state.snapshot.members.find(value => value.name === name)!;
      if (!this.enabled || !state.snapshot.enabled || !['waiting', 'idle'].includes(value.status)) return;
      value.status = 'working'; value.lastReadSeq = Math.max(value.lastReadSeq, head); delete value.error;
      started = true;
    });
    if (!started || !this.enabled || this.member(name).status !== 'working') return;
    const previous = this.live.get(name);
    if (previous && previous.policy !== this.policy()) await this.releaseMember(name, previous);
    if (!this.enabled || this.member(name).status !== 'working') return;
    const live = this.live.get(name) ?? await this.createSession(this.member(name));
    if (!this.enabled || this.member(name).status !== 'working') return;
    const start = live.session.messages.length;
    this.deliveredHeads.set(name, head);
    this.memberDeliveries.set(name, new Map());
    const accepted = await live.session.prompt(`协作公告板增量（已交付到 #${head}）：\n${this.render(batch)}\n\n处理任务后向明确同伴交付；若无需立即回复，调用 swarm_wait 并结束回合。`, { expandPromptTemplates: false, throwOnDrop: true });
    await live.session.waitForIdle();
    await this.nudges.get(name);
    await live.session.waitForIdle();
    if (!this.enabled || this.member(name).status !== 'working') return;
    const messages = live.session.messages.slice(start);
    const failed = messages.find(message => message.role === 'assistant' && (message.stopReason === 'error' || message.stopReason === 'aborted'));
    if (failed?.role === 'assistant') throw Error(failed.errorMessage || '模型请求未完成，请恢复后重试。');
    if (!accepted) throw Error('成员未接收本次消息，请恢复后重试。');
    await live.session.sessionManager.flush();
    const final = [...messages].reverse().find(message => message.role === 'assistant' && messageText(message));
    const deliveredHead = this.consumedHead(this.memberDeliveries.get(name) ?? new Map(), messages, head);
    await this.change(state => {
      const value = state.snapshot.members.find(value => value.name === name)!;
      if (!this.enabled || !state.snapshot.enabled || value.status !== 'working') return;
      state.processed[name] = Math.max(state.processed[name] ?? 0, deliveredHead);
      value.status = 'waiting';
      // 成员未显式交付时，将终稿送达负责人，避免成果静默遗失。
      if (final?.role === 'assistant' && value.lastPostSeq <= head) this.append(state.snapshot, name, ['coordinator'], messageText(final));
    });
  }

  private async wakeCoordinator() {
    if (this.coordinatorBatch || !this.enabled) return;
    const batch = this.store.pending('coordinator');
    if (!batch.some(message => message.delivery !== 'note')) return;
    const head = batch.at(-1)!.seq;
    this.coordinatorBatch = head;
    this.coordinatorSent = false;
    await this.change(state => {
      const member = state.snapshot.members[0];
      if (!this.enabled || !state.snapshot.enabled || this.coordinatorBatch !== head || !['waiting', 'idle'].includes(member.status)) return;
      member.status = 'working'; member.lastReadSeq = Math.max(member.lastReadSeq, head);
    });
    if (!this.enabled || this.coordinatorBatch !== head || this.member('coordinator').status !== 'working') return;
    this.coordinatorSent = true;
    const body = this.coordinatorBody(batch);
    this.coordinatorDeliveries.set(head, body);
    try { await this.api.sendUserMessage(body, { deliverAs: 'aside', attribution: 'agent' }); }
    catch (error) { if (this.coordinatorBatch === head) { this.coordinatorBatch = 0; this.coordinatorSent = false; } throw error; }
  }

  async coordinatorSettled(messages: { role: string; stopReason?: string; errorMessage?: string; content?: unknown }[]) {
    if (!this.coordinatorBatch || !this.coordinatorSent) return;
    const head = this.consumedHead(this.coordinatorDeliveries, messages);
    if (!head) return;
    const last = [...messages].reverse().find(message => message.role === 'assistant');
    if (last?.stopReason === 'error' || last?.stopReason === 'aborted') { this.coordinatorBatch = 0; this.coordinatorSent = false; this.coordinatorDeliveries.clear(); await this.fail('coordinator', Error(last.errorMessage || '主会话响应已中断，待交付消息已保留。')); return; }
    for (const seq of this.coordinatorDeliveries.keys()) if (seq <= head) this.coordinatorDeliveries.delete(seq);
    this.coordinatorBatch = Math.max(0, ...this.coordinatorDeliveries.keys());
    this.coordinatorSent = this.coordinatorBatch > 0;
    await this.change(state => {
      const member = state.snapshot.members[0];
      if (!this.enabled || !state.snapshot.enabled || member.status !== 'working') return;
      state.processed.coordinator = Math.max(state.processed.coordinator ?? 0, head); member.status = this.coordinatorBatch ? 'working' : 'waiting';
    });
    this.schedule();
  }

  private async fail(name: string, error: unknown) {
    if (this.closing) return;
    await this.change(state => { const member = state.snapshot.members.find(member => member.name === name); if (member && this.enabled && state.snapshot.enabled && member.status !== 'stopped') { member.status = 'blocked'; member.error = errorText(error); } });
  }

  private async releaseMember(name: string, value: LiveMember) {
    if (this.live.get(name) === value) this.live.delete(name);
    try { await value.session.dispose(); }
    finally { value.unsubscribe(); this.workerApis.delete(name); bindings.delete(this.member(name).id); }
  }

  private async disposeMember(name: string) {
    const value = this.live.get(name);
    if (!value) return;
    // 独占成员会话先撤回未消费输入，避免 abort 收尾把排队修订自动续跑。
    value.session.clearQueue({ forInterrupt: true });
    await value.session.abort({ reason: '协作成员停止' });
    await this.active.get(name);
    await this.releaseMember(name, value);
  }

  private async stop(target?: string) {
    if (target === 'coordinator') {
      this.coordinatorBatch = 0;
      this.coordinatorSent = false;
      this.coordinatorDeliveries.clear();
      await this.change(state => { state.snapshot.members[0].status = 'stopped'; });
      return;
    }
    const members = this.snapshot().members.filter(member => member.role !== 'coordinator' && (!target || member.name === target));
    await this.change(state => { for (const value of state.snapshot.members) if (members.some(member => member.name === value.name)) value.status = 'stopped'; });
    await Promise.all(members.map(member => this.disposeMember(member.name)));
    await Promise.all(members.map(member => this.active.get(member.name)));
    // 启动尚未完成时 stop 可能先于 live 登记，结算后再释放新建的会话。
    await Promise.all(members.map(member => this.disposeMember(member.name)));
  }

  async close() {
    if (this.closing) return;
    this.closing = true;
    this.coordinatorBatch = 0;
    this.coordinatorSent = false;
    this.coordinatorDeliveries.clear();
    await this.stop();
    await this.store.settled();
  }
}
