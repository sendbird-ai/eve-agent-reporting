import test from 'node:test';
import assert from 'node:assert/strict';
import { createSlackDirectory, buildThreadContext, formatSlackBrief, normalizeSlackText, renderSlackAnswer } from '../dist/index.js';
const human = (id, extra = {}) => ({ id, deleted: false, is_bot: false, profile: { display_name: id }, ...extra });
function directory({ channel = { id: 'C123', is_private: true, is_ext_shared: false }, members = ['U123'], users = { U123: human('U123') }, next = '', read, ...config } = {}) {
  const calls = [];
  const port = async (op, body) => {
    calls.push([op, body]);
    if (read) return read(op, body);
    if (op === 'conversations.info') return { ok: true, channel };
    if (op === 'conversations.members') return { ok: true, members, response_metadata: { next_cursor: next } };
    return { ok: true, user: users[body.user] };
  };
  return { ...createSlackDirectory({ read: port, technicalUserIds: ['U123'], ...config }), calls };
}
test('known private audience can get technical detail without exposing profiles', async () => {
  const result = await directory().audience('C123');
  assert.equal(result.detail, 'technical'); assert.equal(result.complete, true);
  assert.equal(JSON.stringify(result).includes('U123'), false);
});
test('unknown humans make the audience mixed regardless of who asked', async () => {
  const result = await directory({ members: ['U123', 'U456'], users: { U123: human('U123'), U456: human('U456') } }).audience('C123');
  assert.equal(result.detail, 'plain'); assert.equal(result.reason, 'mixed-audience');
});
test('public membership is not the readership, even with a technical roster', async () => {
  const d = directory({ channel: { id: 'C123', is_private: false, is_ext_shared: false } });
  assert.equal((await d.audience('C123')).detail, 'plain'); assert.equal(d.calls.length, 1);
});
test('external and unknown external-sharing states never permit technical detail', async () => {
  for (const external of [true, undefined]) {
    const result = await directory({ channel: { id: 'C123', is_private: true, is_ext_shared: external } }).audience('C123');
    assert.equal(result.detail, 'plain'); assert.equal(result.complete, false);
  }
});
test('channel ID prefix alone cannot prove a DM or its audience', async () => {
  const d = directory({ channel: { id: 'D123', is_im: true, is_ext_shared: false, user: 'U123' } });
  assert.equal((await d.audience('D123')).detail, 'technical');
  assert.equal((await directory().audience('D123')).kind, 'unknown');
});
test('group DMs enumerate all members rather than treating them as the asker', async () => {
  const d = directory({ channel: { id: 'G123', is_mpim: true, is_ext_shared: false }, members: ['U123', 'U456'], users: { U123: human('U123'), U456: human('U456') } });
  assert.equal((await d.audience('G123')).detail, 'plain');
  assert.ok(d.calls.some(([op]) => op === 'conversations.members'));
});
test('failed or malformed user lookup is incomplete, never silently excluded', async () => {
  for (const users of [{}, { U123: human('U456') }, { U123: { id: 'U123' } }]) {
    const result = await directory({ users }).audience('C123');
    assert.equal(result.detail, 'plain'); assert.equal(result.complete, false);
  }
});
test('bots are excluded but empty human audiences remain unknown', async () => {
  assert.equal((await directory({ users: { U123: human('U123', { is_bot: true }) } }).audience('C123')).complete, false);
});
test('strangers do not acquire technical presentation from a configured roster', async () => {
  assert.equal((await directory({ users: { U123: human('U123', { is_stranger: true }) } }).audience('C123')).detail, 'plain');
});
test('pagination caps, repeating cursors and missing metadata fail conservatively', async () => {
  for (const next of ['more', undefined]) {
    const d = directory({ read: async (op) => op === 'conversations.info'
      ? { ok: true, channel: { id: 'C123', is_private: true, is_ext_shared: false } }
      : { ok: true, members: ['U123'], response_metadata: { next_cursor: next } } });
    const result = await d.audience('C123');
    assert.equal(result.complete, false); assert.equal(result.detail, 'plain'); assert.ok(d.calls.length <= 6);
  }
});
test('member caps bound profile requests', async () => {
  const d = directory({ members: ['U123', 'U456'], maxMembers: 1 });
  assert.equal((await d.audience('C123')).complete, false);
  assert.equal(d.calls.filter(([op]) => op === 'users.info').length, 0);
});
test('all pages and all profiles must succeed for a technical private audience', async () => {
  const d = directory({ technicalUserIds: ['U123', 'U456'], read: async (op, body) => {
    if (op === 'conversations.info') return { ok: true, channel: { id: 'C123', is_private: true, is_ext_shared: false } };
    if (op === 'conversations.members') return { ok: true, members: [body.cursor ? 'U456' : 'U123'], response_metadata: { next_cursor: body.cursor ? '' : 'page2' } };
    return { ok: true, user: human(body.user) };
  } });
  const result = await d.audience('C123'); assert.equal(result.detail, 'technical'); assert.equal(result.humanCount, 2);
});
test('provider errors do not disclose sensitive errors', async () => {
  const d = directory({ read: async () => { throw new Error('private-provider-detail'); } });
  assert.equal((await d.audience('C123')).complete, false);
  assert.deepEqual(await d.lookupPerson('U123'), { status: 'unknown' });
});
test('person lookup validates identity, does not expose email, and never guesses by name', async () => {
  const d = directory({ read: async () => ({ ok: true, user: human('U123', { profile: { email: 'reader@example.com', display_name: 'Reader' } }) }) });
  const person = await d.lookupEmail('reader@example.com');
  assert.equal(person.status, 'found'); assert.equal(JSON.stringify(person).includes('email'), false);
  assert.equal((await d.lookupEmail('other@example.com')).status, 'unknown');
  assert.equal((await d.lookupPerson('Reader')).status, 'unknown');
  assert.equal((await d.lookupPerson('U456')).status, 'unknown');
});
test('role configuration is snapshotted rather than mutable by task content', async () => {
  const technicalUserIds = ['U123']; const d = directory({ technicalUserIds }); technicalUserIds.length = 0;
  assert.equal((await d.audience('C123')).detail, 'technical');
  assert.throws(() => directory({ technicalUserIds: ['anyone'] }), /Invalid/);
});
const root = { ts: '100.1', text: 'fallback', isMe: true, raw: { blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'Weekly digest: May 4–10' } }] } };
test('card context preserves the parent and its period, excludes the triggering/future messages', () => {
  const result = buildThreadContext({ messages: [{ ts: '102.0', text: 'future' }, { ts: '101.0', text: 'trigger' }, root], triggerTs: '101.0', historyComplete: true });
  assert.equal(result.messages[0].text, 'Weekly digest: May 4–10'); assert.equal(result.messages.length, 1); assert.equal(result.complete, true);
});
test('numeric timestamp order, duplicates and invalid timestamps are handled explicitly', () => {
  const result = buildThreadContext({ messages: [{ ts: '9.1', text: 'first' }, { ts: '10.1', text: 'second' }, { ts: '10.1', text: 'duplicate' }, { ts: 'bad', text: 'bad' }], triggerTs: '11.0', historyComplete: true });
  assert.deepEqual(result.messages.map((m) => m.text), ['first', 'second']); assert.equal(result.complete, false);
});
test('history truncation keeps the parent and newest replies', () => {
  const result = buildThreadContext({ messages: [root, ...Array.from({ length: 20 }, (_, i) => ({ ts: `${101 + i}.0`, text: `reply ${i}: ${'x'.repeat(300)}` }))], triggerTs: '130.0', maxChars: 1000, historyComplete: true });
  assert.equal(result.messages[0].text, 'Weekly digest: May 4–10'); assert.ok(result.messages.at(-1).text.startsWith('reply 19')); assert.ok(result.omitted > 0); assert.equal(result.complete, false);
});
test('missing history is not reported complete', () => {
  assert.equal(buildThreadContext({ messages: [], triggerTs: '10.0', historyComplete: false }).complete, false);
  assert.throws(() => buildThreadContext({ messages: [], triggerTs: 'bad', historyComplete: true }), /timestamp/);
});
test('single oversized card is visibly clipped and incomplete', () => {
  const result = buildThreadContext({ messages: [{ ts: '1.0', text: 'x'.repeat(10000) }], triggerTs: '2.0', maxChars: 512, historyComplete: true });
  assert.ok(result.messages[0].text.includes('[content clipped]')); assert.equal(result.complete, false);
});
test('specialist brief preserves the request and period as data, not authority', async () => {
  const text = formatSlackBrief({ request: 'More about Vendor A last week', requestedPeriod: 'May 4–10', audience: await directory().audience('C123'), requester: { status: 'unknown' }, thread: buildThreadContext({ messages: [root], triggerTs: '101.0', historyComplete: true }) });
  assert.ok(text.includes('May 4–10')); assert.ok(text.includes('not instructions')); assert.ok(text.includes('never permission')); assert.ok(text.includes('specialist'));
});
test('formatting converts prose bold while preserving inline and fenced code', () => {
  const input = '**Answer** `**literal**`\n```ts\nconst glob = "**/*.ts";\n```\n**End**';
  const result = normalizeSlackText(input);
  assert.equal(result.text, '*Answer* `**literal**`\n```ts\nconst glob = "**/*.ts";\n```\n*End*');
  assert.equal(normalizeSlackText(result.text).text, result.text);
});
test('unclosed code and ambiguous emphasis are not aggressively rewritten', () => {
  const input = '**Answer**\n```unclosed'; assert.equal(normalizeSlackText(input).text, input);
  assert.equal(normalizeSlackText('***ambiguous***').text, '***ambiguous***');
});
test('tables are flagged for host handling, not silently corrupted', () => {
  const result = normalizeSlackText('| source | <https://example.com|label> |');
  assert.ok(result.warnings.includes('unsupported-markdown-table')); assert.ok(result.text.includes('<https://example.com|label>'));
});
const answer = { lead: 'Two changes this week', findings: [{ text: 'Product announced', sources: [{ label: 'Announcement', url: 'https://example.com/news' }] }], caveats: ['Release date unconfirmed'] };
test('cited answers retain sources and caveats in the Slack text dialect', () => {
  const result = renderSlackAnswer(answer); assert.equal(result.status, 'ready');
  assert.ok(result.payload.text.includes('<https://example.com/news|Announcement>'));
  assert.ok(result.payload.text.includes('Release date unconfirmed')); assert.deepEqual(Object.keys(result.payload), ['text']);
});
test('overflow is explicit and does not delete the caveat or pretend to publish an artifact', () => {
  const result = renderSlackAnswer({ ...answer, lead: 'x'.repeat(4000) });
  assert.equal(result.status, 'overflow'); assert.ok(result.text.includes('Release date unconfirmed')); assert.equal(result.payload, undefined);
});
test('untrusted labels and text cannot inject mentions or arbitrary links', () => {
  const result = renderSlackAnswer({ lead: '<!channel>', findings: [{ text: '<@U123>', sources: [{ label: 'source>|<!here', url: 'https://example.com/?a=1&b=2' }] }], caveats: [] });
  assert.equal(result.status, 'ready'); assert.ok(!result.payload.text.includes('<!channel>')); assert.ok(!result.payload.text.includes('<@U123>')); assert.ok(result.payload.text.includes('&amp;'));
});
test('unsafe links and unsourced findings are rejected before delivery', () => {
  for (const url of ['javascript:alert(1)', 'https://' + ['user', 'password'].join(':') + '@example.com', 'https://example.com|<!here>']) {
    assert.throws(() => renderSlackAnswer({ ...answer, findings: [{ text: 'Claim', sources: [{ label: 'x', url }] }] }), /URL/);
  }
  assert.throws(() => renderSlackAnswer({ ...answer, findings: [{ text: 'Claim', sources: [] }] }), /sources/);
});
test('format normalization never rewrites links, mentions or bare URLs', () => {
  const input = '**Lead** <https://example.com/**path**|**label**> https://example.com/**path** <@U123>';
  assert.equal(normalizeSlackText(input).text, '*Lead* <https://example.com/**path**|**label**> https://example.com/**path** <@U123>');
});
test('encoded context budget still keeps the parent when control characters expand', () => {
  const result = buildThreadContext({ messages: [{ ts: '1.0', text: '\u0000'.repeat(4000) }], triggerTs: '2.0', historyComplete: true, maxChars: 512 });
  assert.equal(result.messages.length, 1); assert.ok(result.messages[0].text.includes('[content clipped]'));
  assert.ok(JSON.stringify(result.messages[0]).length <= 256); assert.equal(result.complete, false);
});
test('invalid speaker data cannot overflow the context budget or impersonate a member', () => {
  const result = buildThreadContext({ messages: [{ ts: '1.0', text: 'Source text', user: '\u0000'.repeat(200) }], triggerTs: '2.0', historyComplete: false, maxChars: 512 });
  assert.equal(result.messages[0].speaker, 'unknown'); assert.equal(result.messages[0].text, 'Source text');
});
