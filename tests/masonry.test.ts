/**
 * Where the Notes tab puts each Note, run as the bytes a browser is served.
 *
 * `web/masonry.js` is read off disk and run in a fresh context, exactly as a
 * browser would run it, and nothing of `src/` is imported. What matters is
 * what a person sees: which column a Note starts in, how many columns it
 * spans, how far down it is, and how tall the Notes are together.
 */
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

const REPOSITORY = dirname(dirname(fileURLToPath(import.meta.url)));

/** One Note as the Page measures it: its height at one column and at two. */
type Measured = { single: number; double: number; table: boolean };

type Place = { column: number; span: 1 | 2; top: number };

type Placed = { places: Place[]; height: number };

type PlaceNotes = (notes: Measured[], columns: number, screen: number, gap: number) => Placed;

async function placer(): Promise<PlaceNotes> {
  const code = await readFile(join(REPOSITORY, 'web', 'masonry.js'), 'utf8');
  const context = createContext({});
  runInContext(code, context);
  return context['placeNotes'] as PlaceNotes;
}

/** A short Note with no table, the height given at either width. */
function plain(single: number): Measured {
  return { single, double: single, table: false };
}

/** The places as plain data, since the vm context has arrays of its own. */
function placesOf(placed: Placed): Place[] {
  return JSON.parse(JSON.stringify(placed.places)) as Place[];
}

const SCREEN = 800;
const GAP = 12;

test('a one-column Note goes under the shortest column', async () => {
  const placeNotes = await placer();

  const placed = placeNotes([plain(300), plain(100), plain(200), plain(50)], 3, SCREEN, GAP);

  assert.deepEqual(placesOf(placed), [
    { column: 0, span: 1, top: 0 },
    { column: 1, span: 1, top: 0 },
    { column: 2, span: 1, top: 0 },
    { column: 1, span: 1, top: 112 },
  ]);
});

test('a one-column Note goes in the leftmost of the shortest columns on a tie', async () => {
  const placeNotes = await placer();

  const placed = placeNotes([plain(100), plain(100), plain(100), plain(40)], 3, SCREEN, GAP);

  assert.deepEqual(placesOf(placed)[3], { column: 0, span: 1, top: 112 });
});

test('the Notes keep their order, newest first, and fill the columns left to right', async () => {
  const placeNotes = await placer();

  const placed = placeNotes([plain(10), plain(10), plain(10), plain(10)], 4, SCREEN, GAP);

  assert.deepEqual(
    placesOf(placed).map((place) => place.column),
    [0, 1, 2, 3],
  );
});

test('with one column every Note goes under the one before it', async () => {
  const placeNotes = await placer();

  const placed = placeNotes([plain(100), plain(50), plain(70)], 1, SCREEN, GAP);

  assert.deepEqual(
    placesOf(placed).map((place) => place.top),
    [0, 112, 174],
  );
  assert.equal(placed.height, 244);
});

test('the total height is the bottom of the tallest column, with no gap under it', async () => {
  const placeNotes = await placer();

  const placed = placeNotes([plain(300), plain(100), plain(100)], 2, SCREEN, GAP);

  assert.equal(placed.height, 300);
});

test('no Notes are no height at all', async () => {
  const placeNotes = await placer();

  const placed = placeNotes([], 3, SCREEN, GAP);

  assert.deepEqual(placesOf(placed), []);
  assert.equal(placed.height, 0);
});
