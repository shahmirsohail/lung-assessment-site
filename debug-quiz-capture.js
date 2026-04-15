/**
 * debug-quiz-capture.js
 *
 * Playwright-based debug & verification script for the QuizCapture mechanism.
 * Serves the site locally, navigates to a quiz slide, then:
 *   1. Dispatches a synthetic pointerdown event on an answer button
 *   2. Verifies the capture reaches course.html's quizVarData
 *
 * Run: node debug-quiz-capture.js
 * Exit 0 = capture confirmed; Exit 1 = capture failed
 */
'use strict';

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node22/lib/node_modules/playwright'));
}
const http = require('http');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname);
const PORT = 3456;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.mp4': 'video/mp4', '.mp3': 'audio/mpeg',
  '.swf': 'application/x-shockwave-flash', '.xml': 'application/xml',
};

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const urlPath = req.url.split('?')[0].split('#')[0];
        const filePath = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
        if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const ext = path.extname(filePath).toLowerCase();
          res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
          res.end(fs.readFileSync(filePath));
        } else {
          res.writeHead(404); res.end('Not found: ' + urlPath);
        }
      } catch (e) { res.writeHead(500); res.end(e.message); }
    });
    server.listen(PORT, '127.0.0.1', () => { console.log(`[Server] http://localhost:${PORT}`); resolve(server); });
    server.on('error', reject);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function hr(title) { console.log('\n' + '═'.repeat(70) + '\n  ' + title + '\n' + '═'.repeat(70)); }

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ headless: true, args: ['--disable-web-security'] });
  const context = await browser.newContext({
    storageState: {
      cookies: [],
      origins: [{
        origin: `http://localhost:${PORT}`,
        localStorage: [{ name: 'lungAssessmentLocalUser', value: JSON.stringify({ name: 'Debug User', email: 'debug@test.com', learner_id: 'debug-learner-001', attempt_id: 'debug-attempt-001' }) }],
      }],
    },
  });

  const page = await context.newPage();
  const allLogs = [];
  let quizSlideVarId = null;

  page.on('console', msg => {
    const text = msg.text();
    allLogs.push({ type: msg.type(), text, frameUrl: msg.location()?.url || '' });
    if (text.includes('[QuizCapture]') || text.includes('[DEBUG]')) {
      const tag = (msg.location()?.url || '').includes('index_lms') ? '[IFRAME]' : '[PAGE]  ';
      console.log(`  ${tag} ${text}`);
    }
    if (text.includes('Slide mounted → quiz var')) {
      const m = text.match(/quiz var:\s*(\S+)/);
      if (m) quizSlideVarId = m[1];
    }
  });
  page.on('pageerror', err => { if (!err.message.includes('ERR_CERT')) console.log(`  [ERR] ${err.message}`); });
  await page.route('**/api/**', async route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, attempt_id: 'debug-attempt-001', attempt: { attempt_id: 'debug-attempt-001', learner_name: 'Debug User', learner_email: 'debug@test.com', responses: {}, completed: false } }) }));

  hr('LOADING course.html');
  await page.goto(`http://localhost:${PORT}/course.html`, { waitUntil: 'domcontentloaded' });

  hr('WAITING 8 s FOR STORYLINE');
  await sleep(8000);

  hr('NAVIGATING TO FIRST QUIZ SLIDE');
  for (let round = 1; round <= 15 && !quizSlideVarId; round++) {
    const iframeF = page.frames().find(f => f.url().includes('index_lms'));
    if (!iframeF) break;
    for (const sel of ['[aria-label="NEXT"]', '[aria-label="Next"]', 'button:has-text("NEXT")', 'button:has-text("Next")']) {
      try {
        const loc = iframeF.locator(sel).first();
        if (await loc.isVisible({ timeout: 600 })) { await loc.click({ force: true }); await sleep(2000); break; }
      } catch { /* not found */ }
    }
    if (quizSlideVarId) { console.log(`  ✓ Quiz slide reached at round ${round}: quizSlideVarId=${quizSlideVarId}`); break; }
  }

  if (!quizSlideVarId) { console.log('  ✗ Never reached a quiz slide'); await browser.close(); server.close(); process.exit(1); }

  // ── Primary verification: synthetic pointerdown event ──────────────────────
  // We dispatch a real PointerEvent into the iframe's document, targeting an
  // element with answer-like text. This bypasses Playwright's click machinery and
  // tests the capture mechanism directly.
  hr('SYNTHETIC POINTERDOWN TESTS');

  const iframeFrame = page.frames().find(f => f.url().includes('index_lms'));

  // Test 1: find a button/div with "Normal" or "Abnormal" text and dispatch pointerdown
  const synthResult = await iframeFrame.evaluate(() => {
    function findAnswerTarget() {
      var sw = document.getElementById('slide-window') || document.getElementById('slide') || document.body;
      // Look for any button/div/span that contains an expected answer text
      var candidates = sw.querySelectorAll('button, [role="radio"], [role="option"], [tabindex="0"]');
      var targets = [];
      candidates.forEach(function(el) {
        var t = (el.getAttribute('aria-label') || el.getAttribute('data-acc-text') || el.textContent || '').trim();
        if (/^(Normal|Abnormal|Pleural|Pneumothorax|Alveolar|Interstitial|Confident)/.test(t)) targets.push({ el: el, text: t });
      });
      if (targets.length === 0) {
        // Fallback: any text node inside slide-window
        var walker = document.createTreeWalker(sw, NodeFilter.SHOW_TEXT);
        var n; while ((n = walker.nextNode())) {
          var t = (n.textContent || '').trim();
          if (/^(Normal|Abnormal)$/.test(t)) { targets.push({ el: n.parentElement, text: t }); break; }
        }
      }
      return targets.length ? targets[0] : null;
    }
    var target = findAnswerTarget();
    if (!target) return { found: false, elements: [] };
    // Dispatch a real PointerEvent
    var el = target.el;
    var evt = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, view: window, pointerId: 1, pointerType: 'mouse', isPrimary: true });
    el.dispatchEvent(evt);
    return { found: true, text: target.text, tag: el.tagName, id: el.id, cls: (el.className||'').toString().substring(0,60) };
  }).catch(e => ({ found: false, error: e.message }));

  console.log('  Synthetic pointerdown target:', JSON.stringify(synthResult));

  // Wait for the 200ms capture timeout + extra buffer
  await sleep(500);

  // Check quizVarData in course.html
  const qvd1 = await page.evaluate(() => { try { return quizVarData; } catch { return {}; } }).catch(() => ({}));
  console.log('  quizVarData after synthetic pointerdown:', JSON.stringify(qvd1));

  // Test 2: if no answer target found, dispatch on any element inside slide-window
  //   and check if the ancestor-traversal captures something
  if (Object.keys(qvd1).length === 0 && !synthResult.found) {
    hr('FALLBACK: DISPATCH ON ANY VISIBLE SLIDE ELEMENT');
    const fallback = await iframeFrame.evaluate(() => {
      var sw = document.getElementById('slide-window') || document.body;
      var els = sw.querySelectorAll('button, div[tabindex="0"]');
      var el = null;
      for (var i = 0; i < els.length; i++) {
        var r = els[i].getBoundingClientRect();
        if (r.width > 20 && r.height > 20) { el = els[i]; break; }
      }
      if (!el) return { found: false };
      var evt = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, view: window, pointerId: 1, pointerType: 'mouse', isPrimary: true });
      el.dispatchEvent(evt);
      return { found: true, tag: el.tagName, id: el.id, text: (el.textContent||'').trim().substring(0,80), cls: (el.className||'').toString().substring(0,60) };
    }).catch(e => ({ found: false, error: e.message }));
    console.log('  Fallback target:', JSON.stringify(fallback));
    await sleep(500);
  }

  // Test 3: direct postMessage round-trip (verifies course.html listener works regardless of capture)
  hr('DIRECT POSTMESSAGE ROUND-TRIP TEST');
  await iframeFrame.evaluate((varId) => {
    var data = {};
    data['CurrentQuiz_' + varId] = 'Normal';
    window.parent.postMessage({ type: 'sl_quiz_vars', data: data }, '*');
    console.log('[DEBUG] Direct postMessage sent: CurrentQuiz_' + varId + ' = Normal');
  }, quizSlideVarId);

  await sleep(300);
  const qvd2 = await page.evaluate(() => { try { return quizVarData; } catch { return {}; } }).catch(() => ({}));
  console.log('  quizVarData after direct postMessage:', JSON.stringify(qvd2));

  const postMsgWorks = Object.keys(qvd2).length > 0;
  if (!postMsgWorks) {
    console.log('  ✗ CRITICAL: direct postMessage not received by course.html');
    console.log('    This means the window.message listener in course.html is not working.');
  } else {
    console.log('  ✓ postMessage channel works — quizVarData populated');
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  hr('SUMMARY');
  const captureLogsAll = allLogs.filter(l => l.text.includes('[QuizCapture]'));
  const dsPubSubOk = captureLogsAll.some(l => l.text.includes('DS.pubSub listener registered'));
  const slideMountedOk = captureLogsAll.some(l => l.text.includes('Slide mounted → quiz var'));
  const pdCaptured = captureLogsAll.some(l => l.text.includes('[pd]') || (l.text.includes('=') && !l.text.includes('Slide') && !l.text.includes('listener') && !l.text.includes('diagnostic') && !l.text.includes('signals')));
  const qvdHasData = Object.keys(qvd2).length > 0;

  console.log(`  [${dsPubSubOk ? 'OK  ' : 'FAIL'}] DS.pubSub registered`);
  console.log(`  [${slideMountedOk ? 'OK  ' : 'FAIL'}] Quiz slide mounted (lastQuizVar set)`);
  console.log(`  [${pdCaptured ? 'OK  ' : 'FAIL'}] pointerdown capture fired`);
  console.log(`  [${postMsgWorks ? 'OK  ' : 'FAIL'}] postMessage channel (course.html listener)`);
  console.log(`  [${qvdHasData ? 'OK  ' : 'FAIL'}] quizVarData populated`);

  // PASS requires evidence that the pointerdown capture path fired and sent text.
  // qvdHasData alone is insufficient: the direct postMessage test always populates
  // quizVarData regardless of whether synthetic clicks are captured, so using
  // (pdCaptured || qvdHasData) would mask a broken capture mechanism.
  if (pdCaptured) {
    hr('RESULT: PASS ✓ — quiz capture working');
  } else {
    hr('RESULT: FAIL ✗');
    console.log('  quizVarData after direct postMessage:', JSON.stringify(qvd2));
    console.log('\n  [QuizCapture] logs:');
    captureLogsAll.forEach(l => console.log('   ', l.text));
    if (!postMsgWorks) console.log('\n  Root cause: postMessage channel broken — check course.html window.addEventListener(message...)');
    else console.log('\n  Root cause: pointerdown capture produced no text — check _getAncestorText() and slide element structure');
  }

  await browser.close();
  server.close();
  process.exit(pdCaptured ? 0 : 1);
}

main().catch(e => { console.error('[FATAL]', e); process.exit(1); });
