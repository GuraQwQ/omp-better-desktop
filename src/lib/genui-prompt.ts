import { buildGenUIInstructions, normalizeGenUIConfiguration } from './genui-config';
import { questionResponseText, readQuestionResponse } from './question-response';
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
export function displayUserPrompt(message: string) {
  const index = message.startsWith(start) ? message.indexOf(end) : -1;
  const text = index < 0 ? message : message.slice(index + end.length);
  const response = readQuestionResponse({ id: '', role: 'user', content: text });
  return response ? questionResponseText(response) : text;
}
