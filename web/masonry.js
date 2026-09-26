/* Where each Note goes in the masonry of the Notes tab.

   It decides and nothing else: it touches no DOM and measures nothing, so it
   can be run and tested as plain data. app.js measures the cards, asks this,
   and draws the answer. It is its own file, loaded before app.js the way the
   Markdown renderer is, because the Host serves web/ byte for byte and there
   is no build step to join files (FirstMate ADR-0008).

   It defines one global: placeNotes(notes, columns, screen, gap) →
   { places: [{ column, span, top }], height }, with one place per Note, in
   the order given. Each Note is { single, double, table }: its height at one
   column, its height at two, and whether it holds a table. */
'use strict';

(function () {
  /** The column that ends highest, the leftmost of them on a tie. */
  function shortest(next) {
    let column = 0;
    for (let at = 1; at < next.length; at += 1) {
      if (next[at] < next[column]) column = at;
    }
    return column;
  }

  /**
   * Put each Note, newest first, under the shortest column so far. A long
   * Note then pushes down only its own column, and the small Notes after it
   * stay in view instead of waiting under the tallest card of a row.
   */
  function placeNotes(notes, columns, screen, gap) {
    // Where the next Note in each column would start.
    const next = Array.from({ length: columns }, () => 0);
    const places = notes.map((note) => {
      const column = shortest(next);
      const top = next[column];
      next[column] = top + note.single + gap;
      return { column, span: 1, top };
    });
    return { places, height: Math.max(0, Math.max(...next) - gap) };
  }

  globalThis.placeNotes = placeNotes;
})();
