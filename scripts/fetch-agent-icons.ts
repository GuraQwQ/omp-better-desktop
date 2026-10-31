import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

const directory = path.resolve(import.meta.dir, '..', 'public', 'agent-icons');
const sources = [
  { id: 'gemini', name: 'Gemini', owner: 'Google', page: 'https://gemini.google.com/', url: 'https://www.gstatic.com/lamda/images/gemini_sparkle_4g_512_lt_f94943af3be039176192d.png' },
  { id: 'antigravity', name: 'Antigravity', owner: 'Google', page: 'https://antigravity.google/', url: 'https://antigravity.google/assets/image/antigravity-logo.png' },
  { id: 'claude', name: 'Claude', owner: 'Anthropic', page: 'https://claude.ai/', url: 'https://claude.ai/apple-touch-icon.png' },
  { id: 'codex', name: 'Codex', owner: 'OpenAI', page: 'https://developers.openai.com/codex/', url: 'https://developers.openai.com/favicon.png' },
  { id: 'trae', name: 'Trae', owner: 'ByteDance', page: 'https://www.trae.ai/', url: 'https://lf16-web-neutral.traecdn.ai/obj/trae-ai-static/trae_website/favicon.png' },
  { id: 'zcode', name: 'ZCode', owner: 'Z.ai', page: 'https://github.com/zai-org/ZCode', url: 'https://raw.githubusercontent.com/zai-org/ZCode/a60ba6a7e5a06742270ca605f5d2cc2766afa7e1/packages/desktop/build/icons/64x64.png' },
  { id: 'ccswitch', name: 'CC Switch', owner: 'farion1231 / CC Switch contributors', page: 'https://github.com/farion1231/cc-switch', url: 'https://raw.githubusercontent.com/farion1231/cc-switch/e49d12a5f90b70107cc4e69b6621d2e218524890/src-tauri/icons/64x64.png' },
];

export function pngSize(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 45 || !Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw Error('响应不是 PNG 图片。');
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let width = 0;
  let height = 0;
  let imageData = false;
  while (offset + 12 <= bytes.length) {
    const length = data.getUint32(offset);
    const type = Buffer.from(bytes.subarray(offset + 4, offset + 8)).toString('ascii');
    if (length > bytes.length - offset - 12) throw Error('PNG 图片内容不完整。');
    if (offset === 8) {
      if (type !== 'IHDR' || length !== 13) throw Error('PNG 图片头无效。');
      width = data.getUint32(offset + 8); height = data.getUint32(offset + 12);
      if (!width || !height || width > 4096 || height > 4096) throw Error('PNG 图片尺寸无效。');
    }
    if (type === 'IDAT') imageData = true;
    offset += length + 12;
    if (type === 'IEND') {
      if (length || !imageData || offset !== bytes.length) throw Error('PNG 图片结束块无效。');
      return { width, height };
    }
  }
  throw Error('PNG 图片缺少结束块。');
}

async function publish(file: string, bytes: Uint8Array): Promise<void> {
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.pending`;
  try { await fs.writeFile(temporary, bytes, { flag: 'wx' }); await fs.rename(temporary, file); }
  finally { await fs.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}

export async function fetchAgentIcons(): Promise<void> {
  if (process.platform === 'win32' && /^[cC]:[\\/]/.test(directory)) throw Error('图标输出目录必须位于非 C 盘。');
  await fs.mkdir(directory, { recursive: true });
  const results = await Promise.all(sources.map(async source => {
    const file = path.join(directory, `${source.id}.png`);
    try {
      let bytes: Uint8Array | undefined;
      try { const existing = await fs.readFile(file); pngSize(existing); bytes = existing; }
      catch (error) { if ((error as NodeJS.ErrnoException).code && (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      if (!bytes) {
        const response = await fetch(source.url, { signal: AbortSignal.timeout(20_000), headers: { 'User-Agent': 'Better-OMP-Desktop icon build' } });
        if (!response.ok) throw Error(`HTTP ${response.status}`);
        if (!response.headers.get('content-type')?.toLowerCase().startsWith('image/png')) throw Error('下载地址没有返回 PNG 图片。');
        const candidate = new Uint8Array(await response.arrayBuffer());
        if (candidate.length > 2 * 1024 * 1024) throw Error('图标超过 2 MiB。');
        pngSize(candidate);
        await publish(file, candidate);
        bytes = candidate;
        console.log(`已下载图标：${source.name}`);
      }
      return { ...source, file: `${source.id}.png`, ...pngSize(bytes), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), attribution: '软件名称和图标归各自权利人所有，用于标识配置来源。' };
    } catch (error) {
      console.warn(`图标 ${source.name} 未更新，界面将使用备用图标：${error instanceof Error ? error.message : String(error)}`);
      return { ...source, file: `${source.id}.png`, available: false, attribution: '软件名称和图标归各自权利人所有。' };
    }
  }));
  await publish(path.join(directory, 'manifest.json'), new TextEncoder().encode(`${JSON.stringify({ icons: results }, null, 2)}\n`));
}

if (import.meta.main) await fetchAgentIcons();
