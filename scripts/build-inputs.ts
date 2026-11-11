export const modelCapabilitySources = ['model-metadata.mjs', 'model-metadata.d.mts', 'model-capabilities.json', 'model-capabilities-overrides.json'] as const;

const runtimePaths = [
  ...modelCapabilitySources.map(name => `src-tauri/src/${name}`),
  'upstream.lock.json', 'package.json', 'bun.lock', 'scripts/build-inputs.ts',
  'scripts/build-runtime.ts', 'scripts/build-install.ts', 'scripts/prepare-upstream.ts',
  'scripts/generate-catalog.ts', 'scripts/package-runtime.ts', 'scripts/smoke-runtime.ts',
];

export function buildScope(files: string[], workflowDispatch = false) {
  const runtime = workflowDispatch || files.some(file => file.startsWith('patches/') || file.startsWith('vendor/omp-rpc/') || file.startsWith('src/generated/') || runtimePaths.includes(file));
  return { runtime, host: runtime || files.some(file => file.startsWith('src-tauri/')) };
}
