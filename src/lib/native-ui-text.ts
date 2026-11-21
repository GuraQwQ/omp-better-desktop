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
  'A browser window should open. Complete login to finish.': '浏览器窗口将打开，请在浏览器中完成登录。',
  'Complete login in your browser. If the browser cannot reach this machine, paste the final redirect URL or authorization code when prompted.': '请在浏览器中完成登录。如果浏览器无法访问本机，请按提示粘贴最终跳转地址或授权码。',
  'Complete Z.ai login in your browser. On supported local desktops, omp captures the zcode:// callback and restores its previous handler automatically. You can also paste the final redirect URL or authorization code when prompted.': '请在浏览器中完成 Z.ai 登录。在支持的桌面环境中，OMP 会接收 zcode:// 回调并自动恢复原有处理程序。也可以按提示粘贴最终跳转地址或授权码。',
  'Sign in to Devin in your browser.': '请在浏览器中登录 Devin。',
  'Complete the sign-in in your browser.': '请在浏览器中完成登录。',
  'Complete GitLab login in browser. If GitLab responds with "The redirect URI included is not valid", register your own GitLab OAuth application and set GITLAB_CLIENT_ID + GITLAB_REDIRECT_URI, or use a Personal Access Token via GITLAB_TOKEN.': '请在浏览器中完成 GitLab 登录。如果 GitLab 提示重定向地址无效，请注册自己的 GitLab OAuth 应用并设置 GITLAB_CLIENT_ID 和 GITLAB_REDIRECT_URI，或通过 GITLAB_TOKEN 使用个人访问令牌。',
  "Complete GitLab login in your browser. This uses GitLab's official VS Code OAuth application. If the redirect opens VS Code instead of returning to OMP, copy the full vscode://gitlab.gitlab-workflow/authentication?... callback URL from VS Code/browser and paste it back into OMP.": '请在浏览器中通过 GitLab 官方 VS Code OAuth 应用完成登录。如果跳转后打开了 VS Code，请从 VS Code 或浏览器复制完整的 vscode://gitlab.gitlab-workflow/authentication?... 回调地址，再粘贴到 OMP。',
  'Sign in to your stencil.so account in the browser. If the browser cannot reach this machine, paste the final redirect URL when prompted.': '请在浏览器中登录 stencil.so。如果浏览器无法访问本机，请按提示粘贴最终跳转地址。',
  'Paste the authorization code (or full redirect URL):': '粘贴授权码或完整的跳转地址',
  'Google explicitly supports ACP-compatible editors, but its guidance on third-party coding agents is inconsistent. This provider uses the official agy CLI over ACP with your Antigravity login.': 'Google 明确支持兼容 ACP 的编辑器，但有关第三方编程代理的指引不一致。此提供商通过 ACP 使用官方 agy 命令行工具和你的 Antigravity 账户。',
  "Google's Antigravity terms do not allow signing in from third-party tools like omp, and Google has suspended accounts that did (see #18341). If you depend on this Google account, use GEMINI_API_KEY (AI Studio) or google-vertex instead.": 'Google Antigravity 的条款禁止通过 OMP 等第三方工具登录。Google 已暂停过以这种方式登录的账户（见 #18341）。如果你依赖这个 Google 账户，请改用 GEMINI_API_KEY（AI Studio）或 google-vertex。',
  'Copy your API key from the dashboard': '从控制台复制 API 密钥。',
  'Copy your API key from the Coding Plan dashboard': '从 Coding Plan 控制台复制 API 密钥。',
  'Create or copy your Umans API key from Dashboard → API Keys.': '在 Umans 控制台的 API Keys 页面创建或复制 API 密钥。',
  'Copy your Qwen OAuth token or API key': '复制千问 OAuth 令牌或 API 密钥。',
  'Paste your Qwen OAuth token or API key': '粘贴千问 OAuth 令牌或 API 密钥',
  'Subscribe to Token Plan and copy your API key': '订阅 Token Plan 并复制 API 密钥。',
  'Copy your token-plan API key for the Singapore region': '复制新加坡地区的 Token Plan API 密钥。',
  'Copy your token-plan API key for the Europe region': '复制欧洲地区的 Token Plan API 密钥。',
  'Copy your token-plan API key for the China region': '复制中国地区的 Token Plan API 密钥。',
  'Paste your Xiaomi Token Plan Singapore API key (tp-...)': '粘贴小米 Token Plan 新加坡地区的 API 密钥（tp-…）',
  'Paste your Xiaomi Token Plan Europe API key (tp-...)': '粘贴小米 Token Plan 欧洲地区的 API 密钥（tp-…）',
  'Paste your Xiaomi Token Plan China API key (tp-...)': '粘贴小米 Token Plan 中国地区的 API 密钥（tp-…）',
  'Create a dedicated Fire Pass API key in the Fireworks dashboard': '在 Fireworks 控制台创建 Fire Pass 专用 API 密钥。',
  'Create an API key in the Cline dashboard under Settings → API Keys': '在 Cline 控制台的 Settings → API Keys 页面创建 API 密钥。',
  'Create or copy a Provider API key from Command Code Studio': '在 Command Code Studio 中创建或复制 Provider API 密钥。',
  'Copy your API key from the StepFun Open Platform': '从阶跃星辰开放平台复制 API 密钥。',
  'Copy your API key from NVIDIA NGC Personal Keys': '在 NVIDIA NGC 的 Personal Keys 页面复制 API 密钥。',
  'Create/copy a token with Make calls to Inference Providers permission (usable as HUGGINGFACE_HUB_TOKEN or HF_TOKEN)': '创建或复制具备 Make calls to Inference Providers 权限的令牌。可将它用作 HUGGINGFACE_HUB_TOKEN 或 HF_TOKEN。',
  'Paste your Hugging Face token (HUGGINGFACE_HUB_TOKEN / HF_TOKEN)': '粘贴 Hugging Face 令牌（HUGGINGFACE_HUB_TOKEN / HF_TOKEN）',
  'Create a Proxy Auth Token (modal.com/settings/proxy-auth-tokens or `modal workspace proxy-tokens create`) and paste the combined wk-….ws-… token': '在 modal.com/settings/proxy-auth-tokens 创建代理令牌，或运行 modal workspace proxy-tokens create，然后粘贴形如 wk-….ws-… 的完整令牌。',
  'Paste your Modal proxy token': '粘贴 Modal 代理令牌',
  'Copy your Qianfan API key from the console': '从控制台复制百度千帆 API 密钥。',
  'Create or copy your Wafer Serverless API key from the Wafer dashboard': '从 Wafer 控制台创建或复制 Wafer Serverless API 密钥。',
  'Copy your Vercel AI Gateway API key from the Vercel dashboard': '从 Vercel 控制台复制 AI Gateway API 密钥。',
  "Create or select a CoreWeave Serverless Inference project, add export COREWEAVE_PROJECT=<team>/<project> to your shell startup file (for example ~/.zshrc, ~/.bashrc, or your shell's profile/rc file) for the OpenAI-Project header, then copy your API key from account settings": '创建或选择 CoreWeave Serverless Inference 项目，在 Shell 启动文件（如 ~/.zshrc 或 ~/.bashrc）中添加 export COREWEAVE_PROJECT=<team>/<project> 以设置 OpenAI-Project 请求头，然后从账户设置复制 API 密钥。',
  'Run LiteLLM proxy (default http://localhost:4000/v1; set LITELLM_BASE_URL to customize it), then copy your master key or virtual key': '运行 LiteLLM 代理（默认 http://localhost:4000/v1，可通过 LITELLM_BASE_URL 修改），然后复制主密钥或虚拟密钥。',
  'Paste your LiteLLM API key (master key or virtual key)': '粘贴 LiteLLM 主密钥或虚拟密钥',
  'Run a Bifrost gateway (default http://localhost:8080/v1; set BIFROST_BASE_URL to customize it), then copy a virtual key': '运行 Bifrost 网关（默认 http://localhost:8080/v1，可通过 BIFROST_BASE_URL 修改），然后复制虚拟密钥。',
  'Paste your Bifrost virtual key': '粘贴 Bifrost 虚拟密钥',
  'Log in to the OpenCode Zen console and copy your OpenCode Zen API key': '登录 OpenCode Zen 控制台并复制 OpenCode Zen API 密钥。',
  'Log in to the OpenCode Zen console and copy your OpenCode Go API key': '登录 OpenCode Zen 控制台并复制 OpenCode Go API 密钥。',
  'Create or copy your Yolo-Auto API key (yolo_...)': '创建或复制 Yolo-Auto API 密钥（yolo_…）。',
  'Copy your Tavily API key from the API Keys page.': '从 Tavily 的 API Keys 页面复制 API 密钥。',
  'Copy your Kagi Search API key from Kagi API settings. Search API access is beta-only; if unavailable, email support@kagi.com.': '从 Kagi API 设置复制 Kagi Search API 密钥。搜索 API 仅在测试阶段开放，如无法访问，请联系 support@kagi.com。',
  'Copy your Parallel API key from the Parallel settings page.': '从 Parallel 设置页面复制 API 密钥。',
  'Create an API key under Dashboard > API Keys in the Liquid AI console.': '在 Liquid AI 控制台的 Dashboard → API Keys 页面创建 API 密钥。',
  'Create an API key under API Keys in the Nace console.': '在 Nace 控制台的 API Keys 页面创建 API 密钥。',
  'Optional: paste an Ollama API key/token for authenticated hosts. Leave empty for local no-auth mode.': '如果 Ollama 服务要求认证，请粘贴 API 密钥或令牌。本地免认证模式可留空。',
  'Paste your Ollama API key/token (optional)': '粘贴 Ollama API 密钥或令牌（可选）',
  'Create an Ollama Cloud API key, then paste it here.': '创建 Ollama Cloud API 密钥，然后粘贴到此处。',
  'Optional: Paste LM Studio API key (to customize endpoint URL, set LM_STUDIO_BASE_URL env var)': '粘贴 LM Studio API 密钥（可选）。可设置 LM_STUDIO_BASE_URL 环境变量自定义接口地址。',
  'Paste your llama.cpp API key if your server requires auth. Leave empty for local no-auth mode (default base URLs: http://127.0.0.1:8080, then http://127.0.0.1:9931; set LLAMA_CPP_BASE_URL to customize).': '如果 llama.cpp 服务要求认证，请粘贴 API 密钥。本地免认证模式可留空。默认依次尝试 http://127.0.0.1:8080 和 http://127.0.0.1:9931，可通过 LLAMA_CPP_BASE_URL 修改。',
  'Paste your vLLM API key if your server requires auth. Leave empty for local no-auth mode (default base URL: http://127.0.0.1:8000/v1).': '如果 vLLM 服务要求认证，请粘贴 API 密钥。本地免认证模式可留空，默认地址为 http://127.0.0.1:8000/v1。',
  'Create an API key from the SingularityAPI dashboard, then paste it here': '在 SingularityAPI 控制台创建 API 密钥，然后粘贴到此处。',
  'Create a key from the SingularityAPI lanes dashboard, then paste it here': '在 SingularityAPI lanes 控制台创建密钥，然后粘贴到此处。',
  'Paste your SingularityAPI lanes key': '粘贴 SingularityAPI lanes 密钥',
  'Create or copy your API key from the CoralBricks dashboard (keys look like cb_...)': '在 CoralBricks 控制台创建或复制以 cb_ 开头的 API 密钥。',
  'Create an API key in the Modular Console': '在 Modular 控制台创建 API 密钥。',
  'Create an API key on the Scaleway console and paste its Secret Key (SCW_SECRET_KEY)': '在 Scaleway 控制台创建 API 密钥，再粘贴它的 Secret Key（SCW_SECRET_KEY）。',
  'Paste your Scaleway secret key': '粘贴 Scaleway Secret Key',
  'Create a workspace API key in Otari (Settings → API keys) and paste it here': '在 Otari 的 Settings → API keys 页面创建工作区 API 密钥，然后粘贴到此处。',
  'API key': 'API 密钥',
  'Model API key': '模型 API 密钥',
  'Select Kiro login method\n1. Identity Center (your AWS organization)\n2. Builder ID (a personal, free account)\n3. API key (ksk_…)\n4. Google\n5. GitHub': '选择 Kiro 登录方式\n1. Identity Center（AWS 组织账户）\n2. Builder ID（免费个人账户）\n3. API 密钥（ksk_…）\n4. Google\n5. GitHub',
  'Enter Start URL': '输入 Start URL',
  'Enter Region': '输入区域',
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
  if (Object.hasOwn(nativeTextZh, text)) return nativeTextZh[text];
  const code = /^Enter code: (.+)$/.exec(text);
  if (code) return `输入验证码：${code[1]}`;
  const quota = /^Optional quota reporting: open browser DevTools → Network, reload the Token Plan page, filter for api.json, and select the (\S+) request whose api query ends in \/tokenplan\/personal\/api\/v2\/usage\. Copy Request Headers → Cookie, then paste the complete name=value; \.\.\. value here, or press Enter to skip\.$/.exec(text);
  if (quota) return `可选的配额查询：打开浏览器开发者工具的“网络”页，刷新 Token Plan 页面并筛选 api.json，选择 ${quota[1]} 中 api 参数以 /tokenplan/personal/api/v2/usage 结尾的请求。复制“请求头”中的完整 Cookie（name=value; …）并粘贴到此处，或按 Enter 跳过。`;
  const error = /^Error: (.+)$/s.exec(text);
  if (error) { const translated = localizeNativeText(error[1], language); if (translated !== error[1]) return translated; }
  return text;
}

export function localizeNativeQuestion(value: unknown, language: Language): string {
  const text = localizeNativeText(value, language);
  if (language !== 'zh') return text;
  const warning = /^⚠ (.+): use at your own risk\n\n([\s\S]+)\n\nType "yes" to accept the risk and continue$/.exec(text);
  if (warning) return `⚠ ${warning[1]}：使用风险自负\n\n${localizeNativeText(warning[2], language)}\n\n输入 yes 接受风险并继续。`;
  const key = /^Paste your (.+) API key(?: \((optional for local no-auth)\))?$/.exec(text);
  if (key) return `粘贴 ${key[1]} API 密钥${key[2] ? '（本地免认证可留空）' : ''}`;
  const consoleKey = /^(Copy|Create or copy) (?:your|an) (?:API )?key from the (.+) (?:dashboard|console)\.?$/i.exec(text);
  if (consoleKey) return `在 ${consoleKey[2]} 控制台${consoleKey[1] === 'Copy' ? '复制' : '创建或复制'} API 密钥。`;
  const createKey = /^Create or copy your (.+) API key$/.exec(text);
  if (createKey) return `创建或复制 ${createKey[1]} API 密钥。`;
  const kiroCode = /^Confirm code (\S+) in the browser(?: and sign in with (.+))?$/.exec(text);
  if (kiroCode) return `请在浏览器中确认验证码 ${kiroCode[1]}${kiroCode[2] ? `，并使用 ${kiroCode[2]} 登录` : ''}。`;
  return text.replace(/^Select a Kiro profile:(?=\r?\n)/, '选择 Kiro 配置：');
}
