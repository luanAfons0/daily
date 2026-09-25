/**
 * The Plugin Page, as the bytes a browser is served.
 *
 * The Host returns a Plugin's `web/` directory unchanged (FirstMate ADR-0008),
 * so what this test reads off disk is exactly what a browser gets. It asserts
 * the things the Host will not check for you and that break a Page after it is
 * registered: a path that is not relative, an asset that is not there, and an
 * element the script reaches for that the markup does not declare.
 */
import { strict as assert } from 'node:assert';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPOSITORY = dirname(dirname(fileURLToPath(import.meta.url)));
const WEB = join(REPOSITORY, 'web');

/** Every page in web/, and the script each one runs. */
const PAGES = [
  { page: 'index.html', script: 'app.js' },
  { page: 'new.html', script: 'new.js' },
];

/** Every `href` and `src` the page names, in the order it names them. */
function pathsIn(html: string): string[] {
  return [...html.matchAll(/(?:href|src)="([^"]*)"/g)].map((found) => found[1] ?? '');
}

test('the Plugin Page is served as index.html', async () => {
  const page = await stat(join(WEB, 'index.html'));

  assert.ok(page.isFile());
});

for (const { page, script } of PAGES) {
  test(`every path in ${page} is relative, so nothing assumes an address it does not own`, async () => {
    const html = await readFile(join(WEB, page), 'utf8');

    for (const path of pathsIn(html)) {
      if (path.startsWith('data:')) continue;
      assert.ok(!path.startsWith('/'), `${path} assumes it is served from the root`);
      assert.ok(!/^[a-z]+:/i.test(path), `${path} reaches outside the Plugin`);
    }
  });

  test(`every asset ${page} names is beside it in web/, because there is no build step`, async () => {
    const html = await readFile(join(WEB, page), 'utf8');

    for (const path of pathsIn(html)) {
      if (path.startsWith('data:') || path.startsWith('#')) continue;
      const asset = await stat(join(WEB, path));
      assert.ok(asset.isFile(), `${path} is named by ${page} and is not in web/`);
    }
  });

  test(`every element ${script} reaches for is one ${page} declares`, async () => {
    // The Page is the one part of this Plugin no test can drive, so this is
    // the mistake worth catching without a browser: a renamed id leaves the
    // script reading null and the Page blank, and nothing else would say so.
    const html = await readFile(join(WEB, page), 'utf8');
    const code = await readFile(join(WEB, script), 'utf8');

    const declared = new Set([...html.matchAll(/id="([^"]+)"/g)].map((found) => found[1]));
    const wanted = new Set([...code.matchAll(/byId\('([^']+)'\)/g)].map((found) => found[1]));

    assert.ok(wanted.size > 0, 'the script asks for no element at all, which cannot be right');
    for (const id of wanted) {
      assert.ok(declared.has(id), `${script} reads "${id}", which is not in ${page}`);
    }
  });

  test(`${page} calls its tools through rpc.js, loaded before ${script}`, async () => {
    const html = await readFile(join(WEB, page), 'utf8');
    const code = await readFile(join(WEB, script), 'utf8');
    const paths = pathsIn(html);

    assert.ok(paths.includes('rpc.js'), `${page} does not load rpc.js`);
    assert.ok(paths.indexOf('rpc.js') < paths.indexOf(script), 'rpc.js loads too late');
    assert.ok(!code.includes('/p/worklog'), `${script} names the Plugin's address by hand`);
  });
}

test('rpc.js calls the tools over the relative rpc address, never an absolute one', async () => {
  const code = await readFile(join(WEB, 'rpc.js'), 'utf8');

  assert.match(code, /const RPC = 'rpc';/);
  assert.match(code, /method: 'tools\/call'/);
  assert.ok(!code.includes('/p/worklog'), "rpc.js names the Plugin's address by hand");
});

test('the Popup form goes to the main Plugin Page after a save, by a relative path', async () => {
  const code = await readFile(join(WEB, 'new.js'), 'utf8');

  assert.match(code, /location\.assign\('\.\/'\);/);
});

test('the Popup form offers an Entry and a Note, and a Status that starts at Todo', async () => {
  const html = await readFile(join(WEB, 'new.html'), 'utf8');

  assert.match(html, /name="kind" value="entry" checked/);
  assert.match(html, /name="kind" value="note"/);
  assert.match(html, /name="status" value="Todo" checked/);
  for (const status of ['In Progress', 'Done']) {
    assert.ok(html.includes(`name="status" value="${status}"`), `no ${status} to choose`);
  }
});

test('the Markdown renderer is a local file the Page loads before its script', async () => {
  const html = await readFile(join(WEB, 'index.html'), 'utf8');
  const paths = pathsIn(html);

  assert.ok(paths.includes('markdown.js'), 'index.html does not load markdown.js');
  assert.ok(paths.indexOf('markdown.js') < paths.indexOf('app.js'), 'markdown.js loads too late');
  await stat(join(WEB, 'markdown.js'));
});

test('the presentation shows what the Meeting reports, as meeting_markdown decides it', async () => {
  const html = await readFile(join(WEB, 'index.html'), 'utf8');
  const code = await readFile(join(WEB, 'app.js'), 'utf8');

  assert.match(html, /<button[^>]*id="present"[^>]*>Start presentation<\/button>/);
  assert.match(html, /<dialog[^>]*id="stage"/);
  assert.match(code, /call\('meeting_markdown'\)/);
  assert.match(code, /meeting\.done/);
  assert.match(code, /meeting\.workingOn/);
  assert.ok(!html.includes('copy-meeting'), 'the old Copy for the Meeting dialog is still there');
});

test('the Page claims nothing about Entries or Notes before it has asked', async () => {
  const html = await readFile(join(WEB, 'index.html'), 'utf8');

  assert.ok(
    !/Nothing here|no Entries|No Notes|first Cycle/i.test(html),
    'the served markup already says something is empty, which it cannot know before it asks',
  );
});

test('the Page asks before a delete in its own dialog, never in the browser confirm box', async () => {
  const html = await readFile(join(WEB, 'index.html'), 'utf8');
  const code = await readFile(join(WEB, 'app.js'), 'utf8');

  assert.ok(!/\bconfirm\(/.test(code), 'app.js still opens the browser confirm box');
  assert.match(html, /<dialog[^>]*id="confirm-dialog"/);
});

test('the Plugin Page and the Popup form carry Worklog in their titles', async () => {
  const page = await readFile(join(WEB, 'index.html'), 'utf8');
  const popup = await readFile(join(WEB, 'new.html'), 'utf8');

  assert.match(page, /<title>Worklog<\/title>/);
  assert.match(popup, /<title>Worklog — add<\/title>/);
});

test('the Popup tells the Plugin Page what it saved, so the Page draws it without a reload', async () => {
  const popup = await readFile(join(WEB, 'new.js'), 'utf8');
  const page = await readFile(join(WEB, 'app.js'), 'utf8');

  assert.match(popup, /new BroadcastChannel\('worklog'\)/);
  assert.ok(
    popup.indexOf('.postMessage(') < popup.lastIndexOf("location.assign('./');"),
    'the Popup leaves before it says what it saved',
  );
  assert.match(page, /new BroadcastChannel\('worklog'\)/);
});

test('an Entry and a Note are edited in one dialog, so the cards around them do not move', async () => {
  const html = await readFile(join(WEB, 'index.html'), 'utf8');
  const code = await readFile(join(WEB, 'app.js'), 'utf8');

  assert.match(html, /<dialog[^>]*id="edit-dialog"/);
  assert.match(html, /name="edit-status"/);
  assert.ok(!code.includes('card.replaceWith('), 'a card is still edited in place');
  assert.match(code, /sendOnShiftEnter\(byId\('ed-body'\)\)/);
});

test('a double-click on a card opens its editor, so a long one needs no scroll to Edit', async () => {
  const code = await readFile(join(WEB, 'app.js'), 'utf8');

  assert.match(code, /addEventListener\('dblclick'/);
  assert.match(code, /opensOnDoubleClick\(card, \(\) => editEntry\(entry\)\)/);
  assert.match(code, /opensOnDoubleClick\(card, \(\) => editNote\(note\)\)/);
});

test('an open dialog stops the page behind it from scrolling, and casts no glow', async () => {
  const css = await readFile(join(WEB, 'app.css'), 'utf8');

  assert.match(css, /html:has\(dialog\[open\]\)\s*\{\s*overflow: hidden;/);
  for (const dialog of ['.sheet {', '.ask {']) {
    const rule = css.slice(css.indexOf(dialog), css.indexOf('}', css.indexOf(dialog)));
    assert.ok(!rule.includes('box-shadow'), `${dialog} still has a shadow`);
  }
});

test('the Popup keeps the keys of the Page: Shift+Enter saves, Enter is a new line in the text', async () => {
  const code = await readFile(join(WEB, 'new.js'), 'utf8');
  const html = await readFile(join(WEB, 'new.html'), 'utf8');

  assert.match(code, /event\.key === 'Enter' && event\.shiftKey/);
  assert.ok(!/event\.key === 'Enter' && !event\.shiftKey/.test(code), 'Enter alone still saves');
  assert.match(html, /Shift\+Enter saves/);
});

test('an Entry card opens its Link in a new tab, and the click is left to the Link', async () => {
  const code = await readFile(join(WEB, 'app.js'), 'utf8');

  assert.match(code, /target: '_blank'/);
  assert.match(code, /rel: 'noopener noreferrer'/);
  assert.match(code, /address\.protocol !== 'http:' && address\.protocol !== 'https:'/);
  assert.ok(!/<svg[^>]*\shref=|<use\b|<image\b/.test(code), 'a mark loads something');
  assert.match(code, /event\.target\.closest\('a, /);
});

test('an Entry takes a Link in the edit dialog and in the Popup form', async () => {
  const page = await readFile(join(WEB, 'index.html'), 'utf8');
  const popup = await readFile(join(WEB, 'new.html'), 'utf8');

  assert.match(page, /<input[^>]*id="ed-link"[^>]*type="url"/);
  assert.match(popup, /<input[^>]*id="q-link"[^>]*type="url"/);
});
