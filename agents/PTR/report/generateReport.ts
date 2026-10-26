// Generates report.html from reviewManifest.jsonl, then hosts the report folder.
// Usage: npx tsx agents/PTR/report/generateReport.ts [--in <manifest>] [--out <report.html>] [--no-host]
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, basename, dirname, extname, relative } from 'node:path';
import { spawn } from 'node:child_process';

// Copy-paste friendly: run from repo root.
const HOST_CMD = 'npx --yes http-server agents/PTR/report -p 8765 -c-1 -o /index.html';

const scriptDir = import.meta.dirname;
const repoRoot = resolve(scriptDir, '../../..');

type Severity = 'critical' | 'high' | 'medium' | 'low' | 'gap' | 'info';
const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'gap', 'info'];

interface Suite { path: string | null; gitHash: string | null; findings: string[] }
interface Evidence { path: string; capturedAt: string; entries: number; zeroCountRanges: number }
interface Record {
  component: { path: string; gitHash: string; reviewTimestamp: string };
  integrationTest?: Suite;
  mockTest?: Suite;
  generalfindings?: string[];
  reviewMethod?: string;
  coverage?: { evidence?: Evidence[]; comparison?: string; limitations?: string; recommendations?: string[] };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const inPath = resolve(arg('--in') ?? resolve(scriptDir, '../reviewManifest.jsonl'));
const outPath = resolve(arg('--out') ?? resolve(scriptDir, 'report.html'));
const noHost = process.argv.includes('--no-host');

const esc = (v: unknown): string =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const SEV_RE = /^(CRITICAL|HIGH|MEDIUM|LOW|INFO|Coverage gap):\s*/i;
function classify(text: string): { severity: Severity; text: string } {
  const m = SEV_RE.exec(text);
  if (!m) return { severity: 'info', text };
  const key = m[1].toLowerCase();
  return { severity: key === 'coverage gap' ? 'gap' : (key as Severity), text: text.slice(m[0].length) };
}

function groupOf(p: string): string {
  const parts = p.split('/');
  const i = parts.indexOf('corp-src');
  return i >= 0 && i + 2 < parts.length ? parts[i + 1] : basename(dirname(p));
}

let failed = 0;
const records: Record[] = [];
readFileSync(inPath, 'utf8').split(/\r?\n/).forEach((line, i) => {
  if (!line.trim()) return;
  try {
    const r = JSON.parse(line) as Record;
    if (!r?.component?.path) throw new Error('missing component.path');
    records.push(r);
  } catch (e) {
    failed++;
    console.error(`line ${i + 1}: ${(e as Error).message}`);
  }
});

const items = records.map((r) => {
  const suites = (['integration', 'mock'] as const).map((kind) => {
    const s = (kind === 'integration' ? r.integrationTest : r.mockTest) ?? { path: null, gitHash: null, findings: [] };
    return { kind, path: s.path ?? '', gitHash: s.gitHash ?? '', findings: (s.findings ?? []).map(classify) };
  });
  const generalFindings = (r.generalfindings ?? []).map(classify);
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as { [K in Severity]: number };
  for (const s of suites) for (const f of s.findings) counts[f.severity]++;
  for (const finding of generalFindings) counts[finding.severity]++;
  const max = SEVERITIES.find((s) => counts[s] > 0) ?? 'none';
  return { r, suites, counts, max, name: basename(r.component.path, extname(r.component.path)) };
});

const rank = (s: string) => (s === 'none' ? SEVERITIES.length : SEVERITIES.indexOf(s as Severity));
items.sort((a, b) => rank(a.max) - rank(b.max) || a.name.localeCompare(b.name) || a.r.component.path.localeCompare(b.r.component.path));

const suiteTitle = { integration: 'Integration tests', mock: 'Mock tests' };
const out: string[] = [];
out.push('<!doctype html>', '<meta charset="utf-8">', '<title>PTR Review Report</title>');
out.push(`<section id="ptr-report" data-generated="${new Date().toISOString()}" data-source="${esc(relative(repoRoot, inPath).replaceAll('\\', '/'))}" data-count="${items.length}">`);
out.push('<h1>PTR Review Report</h1>');
for (const { r, suites, counts, max, name } of items) {
  const c = r.component;
  const countAttrs = SEVERITIES.map((s) => `data-${s}="${counts[s]}"`).join(' ');
  out.push(`<article data-component="${esc(c.path)}" data-name="${esc(name)}" data-group="${esc(groupOf(c.path))}" data-git-hash="${esc(c.gitHash)}" data-reviewed="${esc(c.reviewTimestamp)}" data-max-severity="${max}" ${countAttrs}>`);
  out.push(`<h2>${esc(name)}</h2>`);
  out.push('<dl data-role="meta">');
  out.push(`<dt>Path</dt><dd>${esc(c.path)}</dd>`);
  out.push(`<dt>Git hash</dt><dd>${esc(c.gitHash)}</dd>`);
  out.push(`<dt>Reviewed</dt><dd>${esc(c.reviewTimestamp)}</dd>`);
  out.push(`<dt>Method</dt><dd>${esc(r.reviewMethod)}</dd>`);
  out.push('</dl>');
  for (const s of suites) {
    out.push(`<section data-suite="${s.kind}" data-path="${esc(s.path)}" data-git-hash="${esc(s.gitHash)}">`);
    out.push(`<h3>${suiteTitle[s.kind]}</h3>`, '<ul>');
    for (const f of s.findings) out.push(`<li data-severity="${f.severity}">${esc(f.text)}</li>`);
    out.push('</ul>', '</section>');
  }
  if (r.generalfindings?.length) {
    out.push('<section data-suite="general">', '<h3>General findings</h3>', '<ul>');
    for (const finding of r.generalfindings.map(classify)) out.push(`<li data-severity="${finding.severity}">${esc(finding.text)}</li>`);
    out.push('</ul>', '</section>');
  }
  const cov = r.coverage;
  if (cov) {
    out.push('<section data-role="coverage">', '<h3>Coverage</h3>');
    if (cov.comparison) out.push(`<p data-field="comparison">${esc(cov.comparison)}</p>`);
    if (cov.limitations) out.push(`<p data-field="limitations">${esc(cov.limitations)}</p>`);
    if (cov.recommendations?.length) {
      out.push('<ul data-field="recommendations">');
      for (const rec of cov.recommendations) out.push(`<li>${esc(rec)}</li>`);
      out.push('</ul>');
    }
    if (cov.evidence?.length) {
      out.push('<table data-field="evidence">', '<tr><th>Path</th><th>Captured</th><th>Entries</th><th>Zero-count ranges</th></tr>');
      const ev = [...cov.evidence].sort((a, b) => String(a.capturedAt).localeCompare(String(b.capturedAt)));
      for (const e of ev) out.push(`<tr><td>${esc(e.path)}</td><td>${esc(e.capturedAt)}</td><td>${esc(e.entries)}</td><td>${esc(e.zeroCountRanges)}</td></tr>`);
      out.push('</table>');
    }
    out.push('</section>');
  }
  out.push('</article>');
}
out.push('</section>', '');
writeFileSync(outPath, out.join('\n'), 'utf8');

const findings = items.reduce((n, i) => n + SEVERITIES.reduce((m, s) => m + i.counts[s], 0), 0);
console.log(`Wrote ${relative(repoRoot, outPath)}: ${items.length} components, ${findings} findings${failed ? `, ${failed} bad line(s)` : ''}`);
if (failed) process.exitCode = 1;

if (!noHost) {
  console.log(`Hosting: ${HOST_CMD}  (Ctrl+C to stop)`);
  spawn(HOST_CMD, { shell: true, stdio: 'inherit', cwd: repoRoot });
}
