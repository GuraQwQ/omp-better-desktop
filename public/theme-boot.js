// 首帧前同步设置主题，避免深色用户启动时先闪浅色；App.tsx 会写入同一个缓存键。
try {
  var cached = localStorage.getItem('omp-theme');
  document.documentElement.dataset.theme = cached === 'light' || cached === 'dark' ? cached : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
} catch (error) {}
