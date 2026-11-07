export interface ModelCapabilityFields {
  contextWindow?: number;
  maxContextWindow?: number;
  maxTokens?: number;
  reasoning?: boolean;
  input?: ('text' | 'image')[];
  supportsTools?: boolean;
}
export const capabilityFields: (keyof ModelCapabilityFields)[];
export function normalizeModelId(id: string): string;
export function lookupModelCapabilities(id: string): (ModelCapabilityFields & { id: string; source: string; modalities?: string[]; maxInputTokens?: number }) | undefined;
export function readModelCapabilities(value: unknown): ModelCapabilityFields;
export function inferredModelCapabilities(id: string, supplied?: unknown): { fields: ModelCapabilityFields; source?: string; modalities?: string[]; maxInputTokens?: number };
