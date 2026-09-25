/**
 * Start-up: open `worklog.db`, serve the tools.
 *
 * There is nothing to configure. The Host spawned this process, holds both
 * ends of its pipe, and started it in the Plugin's own directory, so the one
 * file this Plugin owns is one relative path away (FirstMate ADR-0005).
 *
 * It says nothing on the way up. A Plugin Server that started is what the
 * Index Page shows; the journal is for what went wrong.
 */
import { sentenceFor, serve } from './mcp.ts';
import { openStore, renameOldFile } from './store.ts';
import { toolsFor } from './tools.ts';

// A file that cannot be renamed or opened is one sentence and a non-zero exit:
// the Index Page shows the Plugin Stopped and the journal carries the reason.
const store = (() => {
  try {
    renameOldFile();
    return openStore();
  } catch (fault) {
    process.stderr.write(`worklog: ${sentenceFor(fault)}\n`);
    return process.exit(1);
  }
})();

serve(toolsFor(store));
