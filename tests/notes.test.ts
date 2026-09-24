/**
 * Notes are kept, edited, deleted and listed newest first. A Note has no
 * Status and no Cycle.
 */
import { strict as assert } from 'node:assert';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { startedAndShaken, structureOf, type Note } from './helpers/plugin.ts';

type Notes = { readonly notes: readonly Note[] };

test('a fresh Plugin directory has no Notes, and says so rather than failing', async (t) => {
  const plugin = await startedAndShaken(t);

  const listed = structureOf<Notes>(await plugin.call('list_notes'));

  assert.deepEqual(listed.notes, []);
});

test('create_note keeps a Note with the body given, and no Status or Cycle', async (t) => {
  const plugin = await startedAndShaken(t);

  const note = structureOf<Note>(
    await plugin.call('create_note', { body: 'Ask about the **release** date.' }),
  );

  assert.equal(note.body, 'Ask about the **release** date.');
  assert.ok(!('status' in note), 'a Note has a Status');
  assert.ok(!('cycleId' in note), 'a Note has a Cycle');
});

test('Notes are listed newest first', async (t) => {
  const plugin = await startedAndShaken(t);
  const first = structureOf<Note>(await plugin.call('create_note', { body: 'first' }));
  const second = structureOf<Note>(await plugin.call('create_note', { body: 'second' }));
  const third = structureOf<Note>(await plugin.call('create_note', { body: 'third' }));

  const listed = structureOf<Notes>(await plugin.call('list_notes'));

  assert.deepEqual(
    listed.notes.map((note) => note.id),
    [third.id, second.id, first.id],
  );
});

test('update_note gives a Note a new body, and keeps its place in the list', async (t) => {
  const plugin = await startedAndShaken(t);
  const older = structureOf<Note>(await plugin.call('create_note', { body: 'older' }));
  const newer = structureOf<Note>(await plugin.call('create_note', { body: 'newer' }));

  const changed = structureOf<Note>(
    await plugin.call('update_note', { id: older.id, body: 'older, edited' }),
  );
  const listed = structureOf<Notes>(await plugin.call('list_notes'));

  assert.equal(changed.body, 'older, edited');
  assert.equal(changed.createdAt, older.createdAt);
  assert.deepEqual(
    listed.notes.map((note) => note.id),
    [newer.id, older.id],
  );
});

test('delete_note takes a Note away', async (t) => {
  const plugin = await startedAndShaken(t);
  const kept = structureOf<Note>(await plugin.call('create_note', { body: 'kept' }));
  const gone = structureOf<Note>(await plugin.call('create_note', { body: 'gone' }));

  await plugin.call('delete_note', { id: gone.id });
  const listed = structureOf<Notes>(await plugin.call('list_notes'));

  assert.deepEqual(listed.notes, [kept]);
});

test('a Note with an empty body is refused in one sentence', async (t) => {
  const plugin = await startedAndShaken(t);

  for (const body of [undefined, '', '   ', 7]) {
    const answer = await plugin.call('create_note', { body });
    assert.equal(answer.error?.code, -32602, JSON.stringify(body));
    assert.match(answer.error?.message ?? '', /body/);
  }
  const listed = structureOf<Notes>(await plugin.call('list_notes'));
  assert.deepEqual(listed.notes, []);
});

test('an unknown Note id is refused in one sentence that names it', async (t) => {
  const plugin = await startedAndShaken(t);

  for (const [tool, args] of [
    ['update_note', { id: 404, body: 'x' }],
    ['delete_note', { id: 404 }],
  ] as const) {
    const answer = await plugin.call(tool, args);
    assert.equal(answer.error?.code, -32602, tool);
    assert.match(answer.error?.message ?? '', /404/);
  }
});

test('an Entry id is not a Note id: Notes and Entries never mix', async (t) => {
  const plugin = await startedAndShaken(t);
  await plugin.call('create_entry', { title: 'an Entry', status: 'Todo' });

  const answer = await plugin.call('delete_note', { id: 1 });
  const listed = structureOf<Notes>(await plugin.call('list_notes'));

  assert.equal(answer.error?.code, -32602);
  assert.deepEqual(listed.notes, []);
});

test('Notes survive a restart', async (t) => {
  const first = await startedAndShaken(t);
  const note = structureOf<Note>(await first.call('create_note', { body: 'keep me' }));
  first.stop();
  await first.ended();

  const second = await startedAndShaken(t, { directory: first.directory });
  const listed = structureOf<Notes>(await second.call('list_notes'));

  assert.deepEqual(listed.notes, [note]);
});

test('create_note keeps the title given, apart from the body', async (t) => {
  const plugin = await startedAndShaken(t);

  const note = structureOf<Note>(
    await plugin.call('create_note', { title: 'Pontos abertos', body: '- Fila a parte' }),
  );

  assert.equal(note.title, 'Pontos abertos');
  assert.equal(note.body, '- Fila a parte');
});

test('a Note needs no title: one kept without has an empty one', async (t) => {
  const plugin = await startedAndShaken(t);

  const note = structureOf<Note>(await plugin.call('create_note', { body: 'untitled' }));

  assert.equal(note.title, '');
});

test('update_note changes the title when given one, and keeps it when not', async (t) => {
  const plugin = await startedAndShaken(t);
  const note = structureOf<Note>(
    await plugin.call('create_note', { title: 'Before', body: 'text' }),
  );

  const retitled = structureOf<Note>(
    await plugin.call('update_note', { id: note.id, title: 'After', body: 'text' }),
  );
  const kept = structureOf<Note>(
    await plugin.call('update_note', { id: note.id, body: 'new text' }),
  );

  assert.equal(retitled.title, 'After');
  assert.equal(kept.title, 'After');
  assert.equal(kept.body, 'new text');
});

test('a title that is not text is refused in one sentence that names it', async (t) => {
  const plugin = await startedAndShaken(t);

  const answer = await plugin.call('create_note', { title: 7, body: 'text' });

  assert.equal(answer.error?.code, -32602);
  assert.match(answer.error?.message ?? '', /create_note needs "title"/);
});

test('a daily.db from before titles moves up, and its Notes come out untitled', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'daily-v1-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const old = new DatabaseSync(join(directory, 'daily.db'));
  old.exec(`
    CREATE TABLE cycles (id INTEGER PRIMARY KEY, started_at TEXT NOT NULL);
    CREATE TABLE entries (
      id INTEGER PRIMARY KEY, cycle_id INTEGER NOT NULL REFERENCES cycles (id),
      title TEXT NOT NULL, body TEXT,
      status TEXT NOT NULL CHECK (status IN ('Todo', 'In Progress', 'Done')),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE notes (
      id INTEGER PRIMARY KEY, body TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    INSERT INTO notes (body, created_at, updated_at)
      VALUES ('kept before titles', '2026-09-01T10:00:00.000Z', '2026-09-01T10:00:00.000Z');
    PRAGMA user_version = 1;
  `);
  old.close();

  const plugin = await startedAndShaken(t, { directory });
  const listed = structureOf<Notes>(await plugin.call('list_notes'));

  assert.equal(listed.notes.length, 1);
  assert.equal(listed.notes[0]?.title, '');
  assert.equal(listed.notes[0]?.body, 'kept before titles');
});
