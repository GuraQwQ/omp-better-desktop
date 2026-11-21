(() => {
  const root = document.documentElement;
  const system = matchMedia('(prefers-color-scheme: dark)');
  const palettes = ['obsidian', 'classic', 'claude', 'omp', 'custom'];

  function luminance(rgb) {
    return rgb.reduce((total, channel, index) => {
      const value = channel / 255;
      return total + (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][index];
    }, 0);
  }

  function readableAccent(hex, dark) {
    const rgb = hex.match(/[a-f0-9]{2}/gi).map(channel => parseInt(channel, 16));
    // 用带强调底色的控件作为对比基准，保留原色中能达到可读对比的部分。
    const surface = luminance(dark ? [55, 59, 69] : [204, 206, 210]);
    const target = dark ? 255 : 0;
    for (let step = 0; step <= 20; step++) {
      const color = rgb.map(channel => Math.round(channel + (target - channel) * step / 20));
      const value = luminance(color);
      if ((Math.max(value, surface) + 0.05) / (Math.min(value, surface) + 0.05) >= 4.5
        && (dark ? value > surface : value < surface)) {
        return '#' + color.map(channel => channel.toString(16).padStart(2, '0')).join('');
      }
    }
    return dark ? '#ffffff' : '#000000';
  }

  let startup = window.ompStartupAppearance;
  try { startup ??= JSON.parse(localStorage.getItem('omp-appearance')); } catch {}

  function paint({ theme, palette, customAccent }) {
    const dark = theme === 'dark' || theme === 'system' && system.matches;
    const mode = dark ? 'dark' : 'light';
    const accent = customAccent?.[mode];
    root.dataset.theme = mode;
    root.dataset.palette = palette;
    if (palette === 'custom' && /^#[a-f0-9]{6}$/i.test(accent)) {
      root.style.setProperty('--custom-accent', readableAccent(accent, dark));
    } else {
      root.style.removeProperty('--custom-accent');
    }
  }

  window.ompApplyAppearance = (value = {}) => {
    const theme = ['system', 'dark'].includes(value.theme) ? value.theme : 'light';
    const palette = palettes.includes(value.palette) ? value.palette : 'obsidian';
    const customAccent = value.customAccent;
    window.ompAppearance = { theme, palette, customAccent };
    try { localStorage.setItem('omp-appearance', JSON.stringify(window.ompAppearance)); } catch {}
    paint(window.ompAppearance);
  };
  window.ompApplyAppearance(startup ?? {});
  system.addEventListener('change', () => paint(window.ompAppearance));

  root.dataset.motion = 'rich';
  try {
    const motion = localStorage.getItem('omp-motion');
    if (motion === 'normal' || motion === 'reduced') root.dataset.motion = motion;
  } catch {}
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) root.dataset.motion = 'reduced';
})();
