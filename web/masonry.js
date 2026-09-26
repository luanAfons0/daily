/* Where each Note goes in the masonry of the Notes tab.

   It decides and nothing else: it touches no DOM and measures nothing, so it
   can be run and tested as plain data. app.js measures the cards, asks this,
   and draws the answer. It is its own file, loaded before app.js the way the
   Markdown renderer is, because the Host serves web/ byte for byte and there
   is no build step to join files (FirstMate ADR-0008).

   It defines one global: placeNotes(notes, columns, screen, gap) →
   { places: [{ column, span, top }], height }, with one place per Note, in
   the order given. Each Note is { single, double, table }: its height at one
   column, its height at two, and whether it holds a table.

   A Note is one column wide or two, never another width, so the page keeps
   straight columns. A Note with a table is two wide, so the table shows in
   full, and so is a Note much taller than the screen, so it is about half as
   tall; but only when three or more columns fit, or it would take the whole
   list. */
'use strict';

(function () {
  /** How many screens tall a Note may be at one column before it is two wide. */
  const TALL = 1.5;

  /** The column that ends highest, the leftmost of them on a tie. */
  function shortest(next) {
    let column = 0;
    for (let at = 1; at < next.length; at += 1) {
      if (next[at] < next[column]) column = at;
    }
    return column;
  }

  /** Whether a Note is two columns wide rather than one. */
  function wide(note, columns, screen) {
    return columns >= 3 && (note.table || note.single > TALL * screen);
  }

  /**
   * The pair of side-by-side columns whose taller one ends highest, the
   * leftmost pair on a tie, given by its left column.
   */
  function lowestPair(next) {
    let column = 0;
    for (let at = 1; at < next.length - 1; at += 1) {
      if (Math.max(next[at], next[at + 1]) < Math.max(next[column], next[column + 1])) {
        column = at;
      }
    }
    return column;
  }

  /**
   * Put each Note, newest first, under the shortest column so far. A long
   * Note then pushes down only its own column, and the small Notes after it
   * stay in view instead of waiting under the tallest card of a row. A wide
   * Note goes on the lowest pair, under the taller of its two columns; the
   * space under the shorter one stays empty.
   */
  function placeNotes(notes, columns, screen, gap) {
    // Where the next Note in each column would start.
    const next = Array.from({ length: columns }, () => 0);
    const places = notes.map((note) => {
      if (wide(note, columns, screen)) {
        const column = lowestPair(next);
        const top = Math.max(next[column], next[column + 1]);
        next[column] = next[column + 1] = top + note.double + gap;
        return { column, span: 2, top };
      }
      const column = shortest(next);
      const top = next[column];
      next[column] = top + note.single + gap;
      return { column, span: 1, top };
    });
    return { places, height: Math.max(0, Math.max(...next) - gap) };
  }

  globalThis.placeNotes = placeNotes;
})();
