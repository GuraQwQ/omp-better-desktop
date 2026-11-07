export interface ReviewIssue { id: string; title: string; severity: string; file?: string; line?: number; evidence: string; suggestion: string; status: 'open' | 'fixing' | 'verify' | 'resolved' }
export interface ReviewReport { summary: string; issues: ReviewIssue[] }
export function parseReview(text: string): ReviewReport {
  const fence = /```(?:review|json)\s*\n([\s\S]*?)```/g;
  const candidates = [...text.matchAll(fence)].map(match => match[1]);
  if (!candidates.length) candidates.push(text);
  for (const body of candidates.reverse()) {
    try {
      const value = JSON.parse(body);
      if (!value || !Array.isArray(value.issues)) continue;
      if (value.issues.some((issue: any) => !issue || typeof issue.title !== 'string' || typeof issue.evidence !== 'string')) throw new Error('每项问题需要标题与证据。');
      return { summary: String(value.summary ?? ''), issues: value.issues.map((issue: any, i: number) => ({ id: String(issue.id ?? i + 1), title: issue.title, severity: String(issue.severity ?? 'P2'), evidence: issue.evidence, suggestion: String(issue.suggestion ?? ''), file: typeof issue.file === 'string' ? issue.file : undefined, line: Number.isInteger(issue.line) && issue.line > 0 ? issue.line : undefined, status: ['open', 'fixing', 'verify', 'resolved'].includes(issue.status) ? issue.status : 'open' })) };
    } catch (error) { if (error instanceof Error && error.message === '每项问题需要标题与证据。') throw error; }
  }
  throw new Error('未找到评审 JSON。可粘贴包含 summary 和 issues 的报告后重试。');
}
export function reviewPrompt(issue: ReviewIssue, verify = false) { return `${verify ? '复验这项问题的修复，检查原证据与相关回归，并报告结果。' : '修复这项评审问题，完成后说明改动与验证结果。'}\n\n${issue.severity} ${issue.title}\n${issue.file ?? ''}${issue.line ? `:${issue.line}` : ''}\n证据：${issue.evidence}\n建议：${issue.suggestion}`; }
