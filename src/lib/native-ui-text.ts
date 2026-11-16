import type { Language } from './types';

// 仅翻译上游已知的界面文案；配置值、代理提示词和用户自定义文本保持原值。
const nativeTextZh: Record<string, string> = {
  'Fast scout for exploratory codebase research, rapid code analysis, and broad pattern searches; returns compressed context for handoff.': '快速探索代码库、分析代码并搜索相关模式，返回精简结果供后续任务使用。',
  'Code review specialist for quality/security analysis': '审查代码质量与安全问题的专业代理。',
  'Read-only security specialist for evidence-backed repository vulnerability discovery': '以只读方式调查仓库漏洞，并提供可核验的证据。',
  'Read a historical session and nested transcripts to answer a consult.': '阅读历史会话及其子会话记录，回答咨询问题。',
  'General-purpose subagent with full capabilities for delegated multi-step tasks': '具备完整工具能力的通用子代理，处理委派的多步骤任务。',
  'Low-reasoning agent for strictly mechanical updates or data collection only': '处理明确的机械性修改或资料收集的轻量代理。',
  'Generate AGENTS.md for current codebase': '为当前代码库生成 AGENTS.md。',
  'Waiting for browser authentication...': '正在等待浏览器完成登录…',
  'Preparing the Antigravity CLI...': '正在准备 Antigravity 命令行工具…',
  'Sign in with Google, then paste the authorization code or the callback URL.': '使用 Google 登录，然后粘贴授权码或回调地址。',
  'Paste the authorization code (or callback URL)': '粘贴授权码或回调地址',
  'Perplexity email address for a login code (blank for browser SSO)': '输入接收登录验证码的 Perplexity 邮箱（留空使用浏览器单点登录）',
  'Waiting for pasted authorization code...': '正在等待粘贴授权码…',
  'Exchanging authorization code for tokens...': '正在使用授权码获取访问令牌…',
  'Exchanging authorization code for tokens…': '正在使用授权码获取访问令牌…',
  'Initiating device authorization…': '正在启动设备授权…',
  'Validating API key...': '正在验证 API 密钥…',
  'Enabling models...': '正在启用模型…',
  'Login cancelled': '登录已取消。',
  'Login canceled': '登录已取消。',
  'Login successful': '登录成功。',
  'Authentication successful': '授权成功。',
  'Authentication failed': '授权失败，请重试。',
  'Select Alibaba Coding Plan endpoint: 1=International (default), 2=China, 3=Custom — enter 1, 2, or 3': '选择阿里云 Coding Plan 接口：1=国际（默认），2=中国，3=自定义。请输入 1、2 或 3。',
  'Select QwenCloud Token Plan region: 1=International (default), 2=China (Beijing), 3=Custom — enter 1, 2, or 3': '选择千问 Token Plan 区域：1=国际（默认），2=中国（北京），3=自定义。请输入 1、2 或 3。',
  'Enter custom base URL': '输入自定义接口地址',
  'Enter custom Token Plan base URL': '输入自定义 Token Plan 接口地址',
  'Paste your Alibaba Coding Plan API key': '粘贴阿里云 Coding Plan API 密钥',
  'Paste your QwenCloud Token Plan API key': '粘贴千问 Token Plan API 密钥',
  'Copy your API key from the Alibaba Cloud Bailian console (China mainland)': '从阿里云百炼控制台（中国内地）复制 API 密钥。',
  'Copy your API key from the Alibaba Cloud DashScope console': '从阿里云 DashScope 控制台复制 API 密钥。',
  'Copy your API key from the Alibaba Cloud DashScope console (International)': '从阿里云 DashScope 国际控制台复制 API 密钥。',
  'Subscribe to the China (Beijing) 百炼 Token Plan and copy its dedicated API key': '订阅中国（北京）百炼 Token Plan，并复制其专用 API 密钥。',
  'Copy your Token Plan API key for the custom endpoint': '复制自定义接口对应的 Token Plan API 密钥。',
  'Create an AI Gateway token with Run permission, then copy it here.': '创建具有 Run 权限的 AI Gateway 令牌，再粘贴到此处。',
  'Paste your Cloudflare AI Gateway token/API key': '粘贴 Cloudflare AI Gateway 令牌或 API 密钥',
  'Enter your Cloudflare account ID': '输入 Cloudflare 账户 ID',
  '32-character account ID': '32 位账户 ID',
  'Enter your Cloudflare AI Gateway ID': '输入 Cloudflare AI Gateway ID',
  'Create an API token with Workers AI Read and Edit permissions, then copy it here.': '创建具有 Workers AI 读取和编辑权限的 API 令牌，再粘贴到此处。',
  'Paste your Cloudflare API token': '粘贴 Cloudflare API 令牌',
  'Workers AI API token': 'Workers AI API 令牌',
  'Sign in with your Windsurf (Enterprise) account in your browser.': '在浏览器中登录 Windsurf 企业账户。',
  'GitHub Enterprise URL/domain (blank for github.com)': 'GitHub Enterprise 地址或域名（留空使用 github.com）',
  'Checking Cloud Code Assist account status...': '正在检查 Cloud Code Assist 账户状态…',
  'Provisioning the Antigravity free tier...': '正在开通 Antigravity 免费套餐…',
  'Refreshing Cloud Code Assist project...': '正在刷新 Cloud Code Assist 项目…',
  'Checking for existing Cloud Code Assist project...': '正在检查已有的 Cloud Code Assist 项目…',
  'Provisioning Cloud Code Assist project (this may take a moment)...': '正在开通 Cloud Code Assist 项目，请稍候…',
  'Sign in with your Mistral account and approve Mistral Vibe access, then return here.': '登录 Mistral 账户并授权 Mistral Vibe，然后返回此处。',
  'Waiting for Mistral sign-in to complete...': '正在等待 Mistral 登录完成…',
  'Exchanging sign-in for a Mistral API key...': '正在获取 Mistral API 密钥…',
  'Enter your Perplexity email address': '输入 Perplexity 账户邮箱',
  'Fetching Perplexity CSRF token...': '正在获取 Perplexity 验证令牌…',
  'Sending login code to your email...': '正在发送邮箱登录验证码…',
  'Enter the code sent to your email': '输入邮件中的验证码',
  'Verifying login code...': '正在验证登录验证码…',
  'Enter the code from your authenticator app': '输入身份验证器中的验证码',
  'Verifying authenticator code...': '正在验证身份验证器中的验证码…',
  'Complete Perplexity sign-in in the browser window. Choose SSO for your organization.': '在浏览器窗口中完成 Perplexity 登录。组织账户请选择单点登录（SSO）。',
  'Validating Perplexity session...': '正在验证 Perplexity 登录状态…',
  'Checking for Perplexity desktop app...': '正在检查 Perplexity 桌面应用…',
  'Found Perplexity JWT from native app': '已从本机应用读取 Perplexity 登录令牌。',
  'Login method: sso (browser) or email; blank for sso': '登录方式：sso（浏览器）或 email（邮箱）；留空使用 sso。',
  'Sign in to Snowflake in your browser and approve access for omp.': '在浏览器中登录 Snowflake，并授权 OMP 访问。',
  'Enter your Snowflake account identifier or URL': '输入 Snowflake 账户标识或地址',
  'Copy your API key from the Xiaomi MiMo console': '从小米 MiMo 控制台复制 API 密钥。',
  'Paste your Xiaomi API key (sk-... or Token Plan tp-... / ttp-...)': '粘贴小米 API 密钥（sk-… 或 Token Plan 的 tp-… / ttp-…）',
  'sk-..., tp-..., or ttp-...': 'sk-…、tp-… 或 ttp-…',
  'connected': '已连接', 'disconnected': '未连接', 'ready': '就绪', 'error': '错误', 'disabled': '已停用',
  'Connection successful': '连接成功。', 'Connection failed': '连接失败，请检查连接配置后重试。',
};

export function localizeNativeText(value: unknown, language: Language): string {
  const text = value == null ? '' : String(value);
  if (language !== 'zh') return text;
  if (nativeTextZh[text]) return nativeTextZh[text];
  const code = /^Enter code: (.+)$/.exec(text);
  if (code) return `输入验证码：${code[1]}`;
  const quota = /^Optional quota reporting: open browser DevTools → Network, reload the Token Plan page, filter for api.json, and select the (\S+) request whose api query ends in \/tokenplan\/personal\/api\/v2\/usage\. Copy Request Headers → Cookie, then paste the complete name=value; \.\.\. value here, or press Enter to skip\.$/.exec(text);
  if (quota) return `可选的配额查询：打开浏览器开发者工具的“网络”页，刷新 Token Plan 页面并筛选 api.json，选择 ${quota[1]} 中 api 参数以 /tokenplan/personal/api/v2/usage 结尾的请求。复制“请求头”中的完整 Cookie（name=value; …）并粘贴到此处，或按 Enter 跳过。`;
  const error = /^Error: (.+)$/s.exec(text);
  if (error) { const translated = localizeNativeText(error[1], language); if (translated !== error[1]) return translated; }
  return text;
}
