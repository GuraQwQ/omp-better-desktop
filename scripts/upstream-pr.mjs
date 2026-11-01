import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function isPatchUpdate(pr, repository, baseBranch, before, after, files) {
  const oldVersion = /^(\d+)\.(\d+)\.(\d+)$/.exec(before.runtimeVersion);
  const newVersion = /^(\d+)\.(\d+)\.(\d+)$/.exec(after.runtimeVersion);
  const stable = ({ revision, runtimeVersion, ...rest }) => rest;
  return (pr.state === 'open' || pr.merged) && pr.user.login === 'github-actions[bot]' && !pr.draft &&
    pr.head.repo?.full_name === repository && pr.base.repo.full_name === repository && pr.base.ref === baseBranch &&
    pr.head.ref === `automation/omp-${after.runtimeVersion}` &&
    oldVersion !== null && newVersion !== null && oldVersion[1] === newVersion[1] && oldVersion[2] === newVersion[2] && Number(newVersion[3]) > Number(oldVersion[3]) &&
    /^[0-9a-f]{40}$/.test(after.revision) && before.revision !== after.revision &&
    JSON.stringify(stable(before)) === JSON.stringify(stable(after)) &&
    files.length > 0 && files.some(file => file.filename === 'upstream.lock.json') &&
    files.every(file => !file.previous_filename && /^(upstream\.lock\.json|docs\/feature-map\.md|src\/generated\/.+|vendor\/omp-rpc\/src\/(client|wire)\.rs)$/.test(file.filename));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [operation, number] = process.argv.slice(2);
  const repository = process.env.GH_REPO;
  const baseBranch = process.env.BASE_BRANCH;
  if (!repository || !baseBranch || !/^\d+$/.test(number ?? '') || !['check', 'enable', 'verify'].includes(operation)) throw Error('需要操作、PR 编号、GH_REPO 与 BASE_BRANCH。');
  const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' }).trim();
  const api = (endpoint, ...args) => JSON.parse(gh('api', `repos/${repository}/${endpoint}`, ...args));
  let pr = api(`pulls/${number}`);
  const lock = ref => JSON.parse(Buffer.from(api(`contents/upstream.lock.json?ref=${ref}`).content, 'base64').toString('utf8'));
  const files = api(`pulls/${number}/files?per_page=100`, '--paginate', '--slurp').flat();
  const eligible = isPatchUpdate(pr, repository, baseBranch, lock(pr.base.sha), lock(pr.head.sha), files);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `eligible=${eligible}\nhead_sha=${pr.head.sha}\n`, 'utf8');
  if (!eligible) {
    if (operation === 'verify') throw Error(`PR #${number} 已不符合自动发布条件。`);
    console.log(`PR #${number} 保留人工确认。`);
  } else if (operation === 'verify') {
    if (pr.head.sha !== process.env.HEAD_SHA) throw Error('构建提交已被新的 PR 提交替代。');
  } else if (operation === 'enable' && pr.state === 'open') {
    if (pr.mergeable_state === 'behind') {
      gh('api', `repos/${repository}/pulls/${number}/update-branch`, '--method', 'PUT', '-f', `expected_head_sha=${pr.head.sha}`);
      const previous = pr.head.sha;
      for (let attempt = 0; pr.head.sha === previous && attempt < 12; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        pr = api(`pulls/${number}`);
      }
      if (pr.head.sha === previous) throw Error('PR 分支更新尚未完成，可重新运行此流程。');
      if (!isPatchUpdate(pr, repository, baseBranch, lock(pr.base.sha), lock(pr.head.sha), api(`pulls/${number}/files?per_page=100`, '--paginate', '--slurp').flat())) throw Error('更新分支后的 PR 需要人工确认。');
    }
    // 显式批准原 PR 检查；分支 dispatch 不能替代必要的合并检查。
    for (let attempt = 0; attempt < 12; attempt++) {
      const runs = api(`actions/runs?event=pull_request&head_sha=${pr.head.sha}&per_page=100`).workflow_runs.filter(run => run.path === '.github/workflows/check.yml' && run.pull_requests.some(value => value.number === Number(number)));
      if (runs.length > 0) {
        for (const run of runs.filter(run => run.conclusion === 'action_required')) gh('api', `repos/${repository}/actions/runs/${run.id}/approve`, '--method', 'POST');
        break;
      }
      if (attempt === 11) throw Error(`PR #${number} 的必要检查尚未登记，重新运行更新流程可重试。`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    gh('pr', 'merge', number, '--repo', repository, '--auto', '--squash', '--match-head-commit', pr.head.sha);
    console.log(`PR #${number} 已启用检查通过后的自动 squash 合并。`);
  }
}
