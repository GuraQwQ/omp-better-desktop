import { buildGenUIInstructions, normalizeGenUIConfiguration } from './genui-config';
const applied = new Map<string, string>();
const start = '[omp-desktop-genui]\n';
const end = '\n[/omp-desktop-genui]\n\n';
export function genUIPrompt(id: string, message: string, configuration: unknown) {
  const config = normalizeGenUIConfiguration(configuration);
  if (!config.enabled) return { message, key: '' };
  const instructions = buildGenUIInstructions(config);
  const key = instructions;
  return { message: instructions && applied.get(id) !== key ? `${start}${instructions}${end}${message}` : message, key };
}
export function acknowledgeGenUIPrompt(id: string, key: string) { if (key) applied.set(id, key); else applied.delete(id); }
export async function sendGenUIPrompt<T>(id: string, message: string, configuration: unknown, send: (message: string) => Promise<T>): Promise<T> {
  if (message.trim().startsWith('/')) return send(message);
  const prompt = genUIPrompt(id, message, configuration);
  const result = await send(prompt.message);
  acknowledgeGenUIPrompt(id, prompt.key);
  return result;
}
export function displayUserPrompt(message: string) { if (!message.startsWith(start)) return message; const index = message.indexOf(end); return index < 0 ? message : message.slice(index + end.length); }
