import { genUIConfigurationKey, normalizeGenUIConfiguration, type GenUIConfiguration } from './genui-config';

type Snapshot = { configuration: GenUIConfiguration; saving: boolean; error: string | null };

export class GenUISettingsDraft {
  private snapshot: Snapshot;
  private revision = 0;
  private savedRevision = 0;
  private running = false;
  private submitted = new Map<string, number>();
  private listeners = new Set<() => void>();

  constructor(configuration: unknown, private save: (configuration: GenUIConfiguration) => void | Promise<void>) {
    this.snapshot = { configuration: normalizeGenUIConfiguration(configuration), saving: false, error: null };
    this.submitted.set(genUIConfigurationKey(configuration), 0);
  }

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  receive(configuration: unknown) {
    const key = genUIConfigurationKey(configuration);
    const submittedRevision = this.submitted.get(key);
    // 父级可能在保存完成后才呈现旧回包，不能覆盖更新的本地选择。
    if (this.snapshot.saving || this.snapshot.error || key === genUIConfigurationKey(this.snapshot.configuration) || (submittedRevision !== undefined && submittedRevision < this.revision)) return;
    this.revision += 1;
    this.savedRevision = this.revision;
    this.submitted.set(key, this.revision);
    this.publish({ configuration: normalizeGenUIConfiguration(configuration), saving: false, error: null });
  }

  update(change: (configuration: GenUIConfiguration) => GenUIConfiguration) {
    const configuration = normalizeGenUIConfiguration(change(this.snapshot.configuration));
    if (genUIConfigurationKey(configuration) === genUIConfigurationKey(this.snapshot.configuration)) return;
    this.revision += 1;
    this.publish({ configuration, saving: true, error: null });
    void this.flush();
  }

  retry() {
    if (!this.snapshot.error) return;
    this.publish({ ...this.snapshot, saving: true, error: null });
    void this.flush();
  }

  private publish(snapshot: Snapshot) {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }

  private async flush() {
    if (this.running) return;
    this.running = true;
    while (this.savedRevision < this.revision) {
      const revision = this.revision;
      const configuration = this.snapshot.configuration;
      this.submitted.set(genUIConfigurationKey(configuration), revision);
      try {
        await this.save(configuration);
      } catch (error) {
        this.running = false;
        this.publish({ ...this.snapshot, saving: false, error: String(error) || '保存选择失败' });
        return;
      }
      this.savedRevision = revision;
    }
    this.running = false;
    this.publish({ ...this.snapshot, saving: false, error: null });
  }
}
