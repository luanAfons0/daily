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

/** A Note with a table, with its height at one column and at two. */
function tabled(single: number, double: number): Measured {
  return { single, double, table: true };
}

test('a Note with a table is two columns wide when three or more columns fit', async () => {
  const placeNotes = await placer();

  for (const columns of [3, 4, 5]) {
    const placed = placeNotes([tabled(400, 200), plain(100)], columns, SCREEN, GAP);

    assert.deepEqual(placesOf(placed), [
      { column: 0, span: 2, top: 0 },
      { column: 2, span: 1, top: 0 },
    ]);
  }
});

test('a Note with no table stays one column wide', async () => {
  const placeNotes = await placer();

  const placed = placeNotes([plain(100), plain(100), plain(100)], 4, SCREEN, GAP);

  assert.ok(placesOf(placed).every((place) => place.span === 1));
});

test('with one or two columns every Note is one column wide, table or not', async () => {
  const placeNotes = await placer();

  for (const columns of [1, 2]) {
    const placed = placeNotes([tabled(400, 200), plain(100)], columns, SCREEN, GAP);

    assert.ok(
      placesOf(placed).every((place) => place.span === 1),
      `a Note spans two of ${columns} columns`,
    );
    assert.equal(placesOf(placed)[0]?.top, 0);
  }
});

test('a two-column Note is as tall as it is at two columns', async () => {
  const placeNotes = await placer();

  const placed = placeNotes([tabled(400, 200), plain(100), plain(100)], 3, SCREEN, GAP);

  // Both plain Notes go on column 2, which stays shorter than the wide Note.
  assert.deepEqual(placesOf(placed).slice(1), [
    { column: 2, span: 1, top: 0 },
    { column: 2, span: 1, top: 112 },
  ]);
  assert.equal(placed.height, 212);
});

test('a two-column Note goes on the pair whose taller column is lowest', async () => {
  const placeNotes = await placer();

  // The columns end at 312, 112, 212 and 62 before the wide Note.
  const placed = placeNotes(
    [plain(300), plain(100), plain(200), plain(50), tabled(500, 150)],
    4,
    SCREEN,
    GAP,
  );

  // Pairs: 0–1 ends at 312, 1–2 at 212, 2–3 at 212. The leftmost of the lowest wins.
  assert.deepEqual(placesOf(placed)[4], { column: 1, span: 2, top: 212 });
});

test('a two-column Note starts at its pair’s taller bottom, and ends both columns', async () => {
  const placeNotes = await placer();

  const placed = placeNotes(
    [plain(100), plain(300), plain(400), tabled(500, 100), plain(10), plain(10)],
    3,
    SCREEN,
    GAP,
  );

  const places = placesOf(placed);
  // Pairs: 0–1 ends at 312, 1–2 at 412. The wide Note sits at 312 on 0–1.
  assert.deepEqual(places[3], { column: 0, span: 2, top: 312 });
  // Both columns of the pair now end at 424; the space under column 0 stays empty.
  assert.deepEqual(places[4], { column: 2, span: 1, top: 412 });
  assert.deepEqual(places[5], { column: 0, span: 1, top: 424 });
});

test('a Note is never wider than two columns, however wide the list is', async () => {
  const placeNotes = await placer();

  const placed = placeNotes([tabled(900, 300), tabled(900, 300)], 8, SCREEN, GAP);

  assert.deepEqual(placesOf(placed), [
    { column: 0, span: 2, top: 0 },
    { column: 2, span: 2, top: 0 },
  ]);
});

test('the Notes keep their order, newest first, around a two-column Note', async () => {
  const placeNotes = await placer();

  const placed = placeNotes([plain(50), tabled(400, 100), plain(50), plain(50)], 3, SCREEN, GAP);

  assert.deepEqual(
    placesOf(placed).map((place) => [place.column, place.top]),
    [
      [0, 0],
      [1, 0],
      [0, 62],
      [1, 112],
    ],
  );
});
