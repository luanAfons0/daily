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
const PAGES = [{ page: 'index.html', script: 'app.js' }];

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

  test(`${script} calls its tools over the relative rpc address, never an absolute one`, async () => {
    const code = await readFile(join(WEB, script), 'utf8');

    assert.match(code, /const RPC = 'rpc';/);
    assert.ok(!code.includes('/p/daily'), `${script} names the Plugin's address by hand`);
  });
}

test('the Markdown renderer is a local file the Page loads before its script', async () => {
  const html = await readFile(join(WEB, 'index.html'), 'utf8');
  const paths = pathsIn(html);

  assert.ok(paths.includes('markdown.js'), 'index.html does not load markdown.js');
  assert.ok(paths.indexOf('markdown.js') < paths.indexOf('app.js'), 'markdown.js loads too late');
  await stat(join(WEB, 'markdown.js'));
});

test('the Page claims nothing about Entries or Notes before it has asked', async () => {
  const html = await readFile(join(WEB, 'index.html'), 'utf8');

  assert.ok(
    !/Nothing here|no Entries|No Notes/i.test(html),
    'the served markup already says something is empty, which it cannot know before it asks',
  );
});
