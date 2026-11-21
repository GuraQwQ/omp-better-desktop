import type { ITerminalOptions } from '@xterm/xterm';

export function terminalAppearance(): ITerminalOptions {
  const styles = getComputedStyle(document.documentElement);
  const color = (name: string) => styles.getPropertyValue(`--terminal-${name}`).trim();
  return {
    fontFamily: styles.getPropertyValue('--font-code').trim(),
    fontSize: Number.parseFloat(styles.getPropertyValue('--text-code')),
    minimumContrastRatio: 4.5,
    theme: {
      background: color('bg'),
      foreground: color('fg'),
      cursor: color('cursor'),
      selectionBackground: color('selection'),
      selectionForeground: color('fg'),
    },
  };
}
