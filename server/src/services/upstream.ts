// Tier 2 「⚡抓最新」: trigger the upstream ig-sync workflow (process.py on GitHub Actions) NOW
// so brand-new IG/email replies get into Feishu without waiting for the hourly run, then resync
// the mirror. The work runs server-side in the background (a single in-flight job) and the UI
// polls a cheap status endpoint — so no 3-minute HTTP request is held open (the public Cloudflare
// tunnel would time that out). Costs one Actions run per click → in-flight guard prevents spam.
import { syncFromFeishu } from './feishuSync';

const GH_API = 'https://api.github.com';
const GH_PAT = process.env.GH_PAT || '';
const GH_REPO = process.env.GH_REPO || 'jayemaoFYNO/ig-dm-system';
const GH_WORKFLOW = process.env.GH_WORKFLOW || 'ig-sync.yml';

export type FetchPhase = 'idle' | 'triggering' | 'running' | 'syncing' | 'done' | 'error';
type FetchJob = { phase: FetchPhase; startedAt: number; finishedAt?: number; runUrl?: string; error?: string };
let job: FetchJob = { phase: 'idle', startedAt: 0 };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const active = (p: FetchPhase) => p === 'triggering' || p === 'running' || p === 'syncing';

function gh(path: string, init?: any) {
  return fetch(`${GH_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${GH_PAT}`, Accept: 'application/vnd.github+json',
      'User-Agent': 'kol-dashboard', 'X-GitHub-Api-Version': '2022-11-28', ...(init?.headers || {}),
    },
  });
}

export function upstreamFetchStatus(): FetchJob { return job; }

export async function startUpstreamFetch(): Promise<{ ok: boolean; phase: FetchPhase; error?: string }> {
  if (!GH_PAT) return { ok: false, phase: 'error', error: '服务器缺 GH_PAT' };
  if (active(job.phase)) return { ok: true, phase: job.phase };   // already running → re-attach to it
  job = { phase: 'triggering', startedAt: Date.now() };
  const dispatchAt = new Date().toISOString();
  try {
    const r = await gh(`/repos/${GH_REPO}/actions/workflows/${GH_WORKFLOW}/dispatches`,
      { method: 'POST', body: JSON.stringify({ ref: 'main' }) });
    if (r.status !== 204) {
      const t = await r.text();
      job = { phase: 'error', startedAt: Date.now(), error: `触发失败 HTTP ${r.status} ${t.slice(0, 120)}` };
      return { ok: false, phase: 'error', error: job.error };
    }
  } catch (e) {
    job = { phase: 'error', startedAt: Date.now(), error: e instanceof Error ? e.message : String(e) };
    return { ok: false, phase: 'error', error: job.error };
  }
  job.phase = 'running';
  // poll + resync in the background; never block the request
  pollUpstream(dispatchAt).catch((e) => {
    job = { phase: 'error', startedAt: job.startedAt, error: e instanceof Error ? e.message : String(e) };
  });
  return { ok: true, phase: 'running' };
}

async function pollUpstream(dispatchAt: string): Promise<void> {
  // 1) find the run our dispatch created (created_at at/after we asked)
  let runId = 0;
  for (let i = 0; i < 24 && !runId; i++) {
    await sleep(5000);
    const r = await gh(`/repos/${GH_REPO}/actions/workflows/${GH_WORKFLOW}/runs?event=workflow_dispatch&per_page=5`);
    const d: any = await r.json();
    const cand = (d.workflow_runs || []).find((w: any) => w.created_at >= dispatchAt);
    if (cand) { runId = cand.id; job.runUrl = cand.html_url; }
  }
  if (!runId) { job = { phase: 'error', startedAt: job.startedAt, error: '没找到触发的 run' }; return; }
  // 2) poll to completion (cap ~6 min)
  for (let i = 0; i < 45; i++) {
    await sleep(8000);
    const r = await gh(`/repos/${GH_REPO}/actions/runs/${runId}`);
    const run: any = await r.json();
    if (run.status === 'completed') {
      if (run.conclusion !== 'success') {
        job = { phase: 'error', startedAt: job.startedAt, runUrl: run.html_url, error: `上游 run ${run.conclusion}` };
        return;
      }
      // 3) success → pull the freshly-updated Feishu into the mirror (fail-open)
      job.phase = 'syncing';
      try { await syncFromFeishu(); } catch { /* data is in Feishu; the hourly sync will catch the mirror up */ }
      job = { phase: 'done', startedAt: job.startedAt, finishedAt: Date.now(), runUrl: run.html_url };
      return;
    }
  }
  job = { phase: 'error', startedAt: job.startedAt, error: '等待上游超时' };
}
