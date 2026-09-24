/**
 * The Plugin Server starts, answers the Host, and says what it can do.
 *
 * Everything here goes through the one seam: the real `mcp` executable against
 * a temporary Plugin directory, spoken to as the Host speaks to it.
 */
import { strict as assert } from 'node:assert';
import test from 'node:test';
import { PROTOCOL_VERSION, startedAndShaken, startPluginServer } from './helpers/plugin.ts';

/** Every tool Daily ships. The names are the contract with other Plugins. */
const TOOLS = [
  'create_entry',
  'create_note',
  'delete_entry',
  'delete_note',
  'get_cycle',
  'list_cycles',
  'list_notes',
  'start_cycle',
  'update_entry',
  'update_note',
];

test('the Plugin Server answers the handshake', async (t) => {
  const plugin = await startPluginServer(t);

  const answer = await plugin.handshake();

  const result = answer.result as { protocolVersion: string; serverInfo: { name: string } };
  assert.equal(answer.error, undefined);
  assert.equal(result.protocolVersion, PROTOCOL_VERSION);
  assert.equal(result.serverInfo.name, 'daily');
});

test('it names every tool it ships, each with a schema for its arguments', async (t) => {
  const plugin = await startedAndShaken(t);

  const answer = await plugin.ask('tools/list');

  const { tools } = answer.result as {
    tools: { name: string; description: string; inputSchema: { type: string } }[];
  };
  assert.deepEqual(tools.map((tool) => tool.name).sort(), [...TOOLS].sort());
  for (const tool of tools) {
    assert.ok(tool.description.length > 0, `${tool.name} says nothing about itself`);
    assert.equal(tool.inputSchema.type, 'object');
  }
});

test('nothing but JSON-RPC goes to stdout', async (t) => {
  const plugin = await startedAndShaken(t);
  await plugin.ask('tools/list');
  await plugin.call('get_cycle');
  await plugin.call('create_entry', { title: 'Write the spec', status: 'Todo' });
  await plugin.call('create_entry', {});
  await plugin.ask('no/such/method');

  for (const line of plugin.lines()) {
    const message = JSON.parse(line) as { jsonrpc?: string };
    assert.equal(message.jsonrpc, '2.0', `this line on stdout is not JSON-RPC: ${line}`);
  }
});

test('a line on stdin that is not JSON is one sentence on stderr, and the pipe survives it', async (t) => {
  const plugin = await startedAndShaken(t);
  const said = plugin.lines().length;

  plugin.raw('this is not JSON');
  const answer = await plugin.ask('tools/list');

  assert.ok(plugin.output().includes('was not JSON'), `stderr said: ${plugin.output()}`);
  assert.equal(plugin.lines().length, said + 1, 'the bad line was answered on stdout');
  assert.equal(answer.error, undefined);
});

test('a notification is not answered, because it carries no id', async (t) => {
  const plugin = await startedAndShaken(t);
  const said = plugin.lines().length;

  plugin.notify('notifications/cancelled', {});
  await plugin.ask('tools/list');

  assert.equal(plugin.lines().length, said + 1, 'the notification was answered');
});

test('a method it does not have is refused with a sentence naming it', async (t) => {
  const plugin = await startedAndShaken(t);

  const answer = await plugin.ask('tools/nonsense');

  assert.equal(answer.result, undefined);
  assert.equal(answer.error?.code, -32601);
  assert.ok(answer.error?.message.includes('tools/nonsense'), answer.error?.message);
});

test('a tool it does not have is refused with a sentence naming it', async (t) => {
  const plugin = await startedAndShaken(t);

  const answer = await plugin.call('polish_boots');

  assert.equal(answer.result, undefined);
  assert.equal(answer.error?.code, -32602);
  assert.ok(answer.error?.message.includes('polish_boots'), answer.error?.message);
});

test('closing stdin is how the Host stops it, and it goes quietly', async (t) => {
  const plugin = await startedAndShaken(t);
  await plugin.call('get_cycle');

  plugin.stop();

  const ending = await plugin.ended();
  assert.equal(ending.code, 0);
  assert.equal(plugin.output(), '');
});
