// Live progress reporter for Playwright.
// Shows each test start / pass / fail / retry / skip in real time
// plus a running progress bar and final summary.
// Also writes test-results/steps.json for the dashboard.

const fs   = require('fs');
const path = require('path');

const { bold, green, red, yellow, cyan, gray, reset } = (() => {
  const c = (n) => (s) => `\x1b[${n}m${s}\x1b[0m`;
  return {
    bold:   c('1'),
    green:  c('32'),
    red:    c('31'),
    yellow: c('33'),
    cyan:   c('36'),
    gray:   c('90'),
    reset:  (s) => s,
  };
})();

function fmt(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

function bar(done, total, width = 20) {
  if (!total) return '░'.repeat(width);
  const filled = Math.min(width, Math.max(0, Math.round((done / total) * width)));
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function shortTitle(test) {
  // Show: file › describe › title (truncated)
  const parts = test.titlePath().filter(Boolean);
  const title = parts.slice(-2).join(' › ');
  return title.length > 70 ? title.slice(0, 67) + '…' : title;
}

function flattenSteps(steps, depth = 0) {
  const out = [];
  for (const s of (steps || [])) {
    out.push({
      title:    s.title,
      duration: s.duration || 0,
      error:    s.error?.message || null,
      category: s.category || '',
      depth,
    });
    if (s.steps?.length) out.push(...flattenSteps(s.steps, depth + 1));
  }
  return out;
}

class LiveReporter {
  constructor() {
    this.total      = 0;
    this.done       = 0;
    this.passed     = 0;
    this.failed     = 0;
    this.skipped    = 0;
    this.retried    = 0;
    this.startTime  = Date.now();
    this.failures   = [];
    this.lastLine   = '';
    this.stepsMap   = {};   // test.id → flat step array
  }

  onBegin(config, suite) {
    this.total = suite.allTests().length;
    this.startTime = Date.now();
    process.stdout.write(`\n${bold('🚀 Starting')} ${cyan(this.total)} tests\n\n`);
  }

  onTestBegin(test, result) {
    const idx  = String(this.done + 1).padStart(String(this.total).length);
    const line = gray(`⟳  [${idx}/${this.total}] `) + shortTitle(test);
    process.stdout.write(line + '\n');
  }

  // Forward test console.log / console.error output so it appears in real time
  onStdOut(chunk, test) {
    const prefix = test ? gray(`  [${shortTitle(test).slice(0, 30)}] `) : '  ';
    process.stdout.write(prefix + chunk.toString());
  }

  onStdErr(chunk, test) {
    const prefix = test ? red(`  [${shortTitle(test).slice(0, 30)}] `) : '  ';
    process.stderr.write(prefix + chunk.toString());
  }

  onTestEnd(test, result) {
    this.done++;

    const idx     = String(this.done).padStart(String(this.total).length);
    const elapsed = gray(` ${fmt(result.duration).padStart(5)} `);
    const title   = shortTitle(test);

    if (result.status === 'skipped') {
      this.skipped++;
      process.stdout.write(yellow(`⏭  [${idx}/${this.total}]`) + elapsed + gray('SKIP · ') + gray(title) + '\n');
      return;
    }

    if (result.retry > 0) {
      this.retried++;
    }

    if (result.status === 'passed') {
      this.passed++;
      process.stdout.write(green(`✅  [${idx}/${this.total}]`) + elapsed + title + '\n');
    } else if (result.status === 'failed' || result.status === 'timedOut') {
      // Only count as failure on final attempt
      if (result.retry === test.retries) {
        this.failed++;
        this.failures.push({ title: test.titlePath().filter(Boolean).join(' › '), error: result.error?.message?.split('\n')[0] || '' });
      }
      const retryTag = result.retry < test.retries
        ? yellow(` → retry #${result.retry + 1}`)
        : '';
      process.stdout.write(red(`❌  [${idx}/${this.total}]`) + elapsed + title + retryTag + '\n');
    }

    // Capture steps for dashboard (keyed by test.id, last retry wins)
    const steps = flattenSteps(result.steps || []);
    if (steps.length) this.stepsMap[test.id] = steps;

    // Progress bar every 5 tests or on failure
    if (this.done % 5 === 0 || result.status === 'failed') {
      this._printProgress();
    }
  }

  _printProgress() {
    const elapsed = Date.now() - this.startTime;
    const pct     = this.total ? Math.min(100, Math.round((this.done / this.total) * 100)) : 0;
    const b       = bar(this.done, this.total);
    const line    = [
      cyan(`\n  [${b}] ${pct}%`),
      green(`  ✅ ${this.passed}`),
      this.failed  ? red(  `  ❌ ${this.failed}`) : gray(`  ❌ 0`),
      this.skipped ? yellow(`  ⏭ ${this.skipped}`) : gray(`  ⏭ 0`),
      this.retried ? yellow(`  🔁 ${this.retried} retried`) : '',
      gray(`  ⏱ ${fmt(elapsed)}`),
      '\n',
    ].join('');
    process.stdout.write(line);
  }

  onEnd(result) {
    const elapsed = Date.now() - this.startTime;
    const line    = '━'.repeat(60);

    process.stdout.write(`\n${cyan(line)}\n`);
    process.stdout.write(bold('📊 Final Results') + `  ${gray(fmt(elapsed))}\n`);
    process.stdout.write(`   ${green(`✅ ${this.passed} passed`)}   ${red(`❌ ${this.failed} failed`)}   ${yellow(`⏭ ${this.skipped} skipped`)}   ${yellow(`🔁 ${this.retried} retried`)}\n`);

    if (this.failures.length) {
      process.stdout.write(`\n${red(bold('Failed tests:'))}\n`);
      this.failures.forEach((f, i) => {
        process.stdout.write(`  ${red(`${i + 1}.`)} ${f.title}\n`);
        if (f.error) process.stdout.write(`     ${gray(f.error.slice(0, 100))}\n`);
      });
    }

    process.stdout.write(`${cyan(line)}\n\n`);

    // Write steps.json for the dashboard
    try {
      const outDir = path.resolve(__dirname, '../test-results');
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, 'steps.json'), JSON.stringify(this.stepsMap, null, 2));
    } catch (e) {
      process.stderr.write(`[liveReporter] Could not write steps.json: ${e.message}\n`);
    }
  }
}

module.exports = LiveReporter;
