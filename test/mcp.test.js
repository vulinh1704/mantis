/**
 * `mantis mcp`. The protocol is checked on its own (initialize, tools/list, tools/call with
 * progress, errors, cancellation) with a stub tool runner, then end to end with the official MCP
 * TypeScript SDK client (a dev dependency only) against the real CLI and the fixtures.
 */
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { after, before, describe, test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { PROTOCOL_VERSIONS, TOOLS, argvFor, serveMcp } from '../src/mcp.js';
import { UsageError, parseLookArgs, parsePerfArgs } from '../src/options.js';
import { BIN } from './helpers/cli.js';
import { FIXTURES, startStaticServer } from './helpers/static-server.js';
import { startSlowServer } from './helpers/slow-server.js';

/** A server on in-memory streams: send() a message, next() the next one it writes. */
function harness(run) {
  const input = new PassThrough();
  const output = new PassThrough();
  const queue = [];
  const waiters = [];
  let buf = '';
  output.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const msg = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      const w = waiters.shift();
      if (w) w(msg);
      else queue.push(msg);
    }
  });
  const done = serveMcp({ input, output, run });
  return {
    send: (m) => input.write(`${JSON.stringify({ jsonrpc: '2.0', ...m })}\n`),
    next: () => (queue.length ? Promise.resolve(queue.shift()) : new Promise((r) => waiters.push(r))),
    end: async () => {
      input.end();
      await done;
    },
    pending: () => queue.length,
  };
}

describe('mcp: tool arguments become CLI arguments', () => {
  test('look, perf and proof', () => {
    assert.deepEqual(argvFor('mantis_look', { url: 'http://x', routes: ['/', '/a'], viewports: ['mobile'], locales: ['en', 'pseudo'], ignore: ['.ad', '#chat'], baseline: 'none' }), [
      'http://x', '--routes', '/,/a', '--viewports', 'mobile', '--locales', 'en,pseudo', '--ignore', '.ad', '--ignore', '#chat', '--baseline', 'none',
    ]);
    assert.deepEqual(argvFor('mantis_perf', { url: 'http://x' }), ['http://x', '--runs', '3'], 'quicker by default than the CLI');
    assert.deepEqual(argvFor('mantis_perf', { url: 'http://x', runs: 7, profile: 'desktop' }), ['http://x', '--runs', '7', '--profile', 'desktop']);
    assert.deepEqual(argvFor('mantis_proof', { before: 'first', after: 'latest' }), ['--before', 'first', '--after', 'latest']);
    assert.equal(parseLookArgs(argvFor('mantis_look', { url: 'http://x', viewports: ['mobile'] })).viewports[0].name, 'mobile');
    assert.equal(parsePerfArgs(argvFor('mantis_perf', { url: 'http://x' })).runs, 3);
    assert.throws(() => parseLookArgs(argvFor('mantis_look', { url: 'http://x', viewports: ['phone'] })), UsageError);
  });

  test('every tool has a name, a description and an object input schema', () => {
    assert.deepEqual(TOOLS.map((t) => t.name), ['mantis_look', 'mantis_perf', 'mantis_learn', 'mantis_proof']);
    for (const t of TOOLS) {
      assert.ok(t.description.length > 80, t.name);
      assert.equal(t.inputSchema.type, 'object');
      assert.ok(t.inputSchema.required.every((k) => k in t.inputSchema.properties), t.name);
    }
  });
});

describe('mcp: protocol', () => {
  test('initialize, list, call with progress, errors, notifications and cancellation', async () => {
    let release;
    const gate = new Promise((r) => (release = r));
    const h = harness(async (name, args, log) => {
      if (args.url === 'http://slow') await gate;
      if (args.url === 'http://bad') throw new UsageError('invalid URL "bad"');
      log('[/ mobile/light/en] 2 errors');
      return [{ type: 'text', text: `ran ${name} on ${args.url}` }, null];
    });

    h.send({ id: 1, method: 'initialize', params: { protocolVersion: '2099-01-01', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
    const init = await h.next();
    assert.equal(init.result.protocolVersion, PROTOCOL_VERSIONS[0], 'an unknown version gets the newest');
    assert.equal(init.result.serverInfo.name, 'mantis');
    assert.ok(init.result.capabilities.tools);
    h.send({ id: 2, method: 'initialize', params: { protocolVersion: '2025-03-26' } });
    assert.equal((await h.next()).result.protocolVersion, '2025-03-26', 'a known version is kept');
    h.send({ method: 'notifications/initialized' });

    h.send({ id: 3, method: 'tools/list' });
    assert.equal((await h.next()).result.tools.length, 4);

    h.send({ id: 4, method: 'tools/call', params: { name: 'mantis_look', arguments: { url: 'http://x' }, _meta: { progressToken: 'p1' } } });
    const progress = await h.next();
    assert.deepEqual(progress, { jsonrpc: '2.0', method: 'notifications/progress', params: { progressToken: 'p1', progress: 1, message: '[/ mobile/light/en] 2 errors' } });
    const result = await h.next();
    assert.equal(result.id, 4);
    assert.deepEqual(result.result, { content: [{ type: 'text', text: 'ran mantis_look on http://x' }] }, 'empty blocks are dropped');

    h.send({ id: 5, method: 'tools/call', params: { name: 'mantis_look', arguments: { url: 'http://bad' } } });
    const bad = await h.next();
    assert.equal(bad.result.isError, true);
    assert.match(bad.result.content[0].text, /^mantis: invalid URL "bad"/);

    h.send({ id: 6, method: 'tools/call', params: { name: 'nope' } });
    assert.equal((await h.next()).error.code, -32602);
    h.send({ id: 7, method: 'resources/list' });
    assert.equal((await h.next()).error.code, -32601);
    h.send({ id: 8, method: 'ping' });
    assert.deepEqual((await h.next()).result, {});

    // a cancelled call is never answered; the server keeps serving meanwhile
    h.send({ id: 9, method: 'tools/call', params: { name: 'mantis_perf', arguments: { url: 'http://slow' } } });
    h.send({ method: 'notifications/cancelled', params: { requestId: 9 } });
    h.send({ id: 10, method: 'ping' });
    assert.equal((await h.next()).id, 10);
    release();
    await h.end();
    assert.equal(h.pending(), 0, 'nothing was sent for the cancelled call');
  });

  test('a line that is not JSON gets a parse error', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    let out = '';
    output.on('data', (d) => (out += d));
    const done = serveMcp({ input, output, run: async () => [] });
    input.end('not json\n');
    await done;
    assert.equal(JSON.parse(out).error.code, -32700);
  });
});

describe('mcp: end to end with the official SDK client', { concurrency: false }, () => {
  let tmp;
  let client;
  let buggy;
  let slow;

  before(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'mantis-mcp-'));
    buggy = await startStaticServer(path.join(FIXTURES, 'buggy-app'));
    slow = await startSlowServer();
    client = new Client({ name: 'mantis-test', version: '1.0.0' });
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [BIN, 'mcp'], cwd: tmp, stderr: 'ignore' }));
  });

  after(async () => {
    await client?.close();
    await buggy?.close();
    await slow?.close();
    await rm(tmp, { recursive: true, force: true });
  });

  test('the client connects and lists the tools', async () => {
    assert.equal(client.getServerVersion().name, 'mantis');
    assert.match(client.getInstructions(), /mantis_look/);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), ['mantis_learn', 'mantis_look', 'mantis_perf', 'mantis_proof']);
  });

  test('mantis_look: the report as text, the contact sheet as an image, progress while it runs', async () => {
    const progress = [];
    const res = await client.callTool(
      { name: 'mantis_look', arguments: { url: `${buggy.url}/`, viewports: ['mobile'], schemes: ['light'], baseline: 'none' } },
      undefined,
      { onprogress: (p) => progress.push(p), timeout: 240000 },
    );
    assert.ok(!res.isError, JSON.stringify(res.content[0]));
    assert.match(res.content[0].text, /^Mantis: \d+ errors?, \d+ warnings? in 1 cells/);
    assert.match(res.content[0].text, /# Mantis report/);
    assert.match(res.content[0].text, /report: \.mantis\/latest\/report\.md/, 'files are written under the server\'s working directory');
    const img = res.content.find((c) => c.type === 'image');
    assert.equal(img.mimeType, 'image/png');
    assert.equal(Buffer.from(img.data, 'base64').subarray(1, 4).toString(), 'PNG');
    assert.ok(progress.length >= 1);
  });

  test('mantis_perf: the ranked fixes and the perf sheet', async () => {
    const res = await client.callTool({ name: 'mantis_perf', arguments: { url: `${slow.url}/`, runs: 1, profile: 'desktop' } }, undefined, { timeout: 240000 });
    assert.ok(!res.isError, JSON.stringify(res.content[0]));
    assert.match(res.content[0].text, /^Fixes: \d+ do first · \d+ plan/);
    assert.match(res.content[0].text, /## Fixes, ranked/);
    assert.ok(res.content.some((c) => c.type === 'image'));
  });

  test('bad arguments are a tool error with the CLI\'s message, not a crash', async () => {
    const res = await client.callTool({ name: 'mantis_look', arguments: { url: `${buggy.url}/`, viewports: ['phone'] } });
    assert.equal(res.isError, true);
    assert.match(res.content[0].text, /^mantis: .*phone/);
  });
});
