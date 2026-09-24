/**
 * A Note: free Markdown text you keep. It has no Status and belongs to no
 * Cycle, so nothing that happens to a Cycle ever touches one.
 */
import { badInput } from './mcp.ts';
import { now, type Store } from './store.ts';

/** One Note, as a caller sees it. */
export type Note = {
  readonly id: number;
  /** A short name for the Note, apart from its text. Empty when it has none. */
  readonly title: string;
  /** Markdown. Never empty. */
  readonly body: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

type NoteRow = {
  id: number;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
};

const COLUMNS = 'id, title, body, created_at, updated_at';

function noteOf(row: NoteRow): Note {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Every Note, newest first. Newest is the last written, so the order is by id. */
export function listNotes(store: Store): Note[] {
  const rows = store.prepare(`SELECT ${COLUMNS} FROM notes ORDER BY id DESC`).all() as NoteRow[];
  return rows.map(noteOf);
}

/** One Note by its id, or a sentence that says there is none. */
export function noteById(store: Store, id: number): Note {
  const row = store.prepare(`SELECT ${COLUMNS} FROM notes WHERE id = ?`).get(id) as
    | NoteRow
    | undefined;
  if (row === undefined) throw badInput(`No Note has the id ${id}.`);
  return noteOf(row);
}

/** A new Note. */
export function createNote(store: Store, title: string, body: string): Note {
  const at = now();
  const done = store
    .prepare('INSERT INTO notes (title, body, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(title, body, at, at);
  return noteById(store, Number(done.lastInsertRowid));
}

/** One Note with a new body, and a new title when one is given. */
export function updateNote(
  store: Store,
  id: number,
  title: string | undefined,
  body: string,
): Note {
  const before = noteById(store, id);
  store
    .prepare('UPDATE notes SET title = ?, body = ?, updated_at = ? WHERE id = ?')
    .run(title ?? before.title, body, now(), id);
  return noteById(store, id);
}

/** Take one Note away for good. */
export function deleteNote(store: Store, id: number): Note {
  const gone = noteById(store, id);
  store.prepare('DELETE FROM notes WHERE id = ?').run(id);
  return gone;
}

/** A Note's body as given, or a sentence that says a Note is its text. */
export function checkNoteBody(tool: string, given: unknown): string {
  if (typeof given !== 'string' || given.trim() === '') {
    throw badInput(`${tool} needs "body": the Markdown text of the Note, which cannot be empty.`);
  }
  return given;
}

/** A Note's title as given, trimmed; undefined when none was given. */
export function checkNoteTitle(tool: string, given: unknown): string | undefined {
  if (given === undefined || given === null) return undefined;
  if (typeof given !== 'string') {
    throw badInput(`${tool} needs "title" to be text: a short name for the Note, or empty.`);
  }
  return given.trim();
}

/** A Note's id as given, or a sentence that says what an id is. */
export function checkNoteId(tool: string, given: unknown): number {
  if (typeof given === 'number' && Number.isSafeInteger(given) && given > 0) return given;
  throw badInput(
    `${tool} needs "id": the number list_notes gives each Note, and was given ` +
      `${JSON.stringify(given) ?? 'nothing'}.`,
  );
}
