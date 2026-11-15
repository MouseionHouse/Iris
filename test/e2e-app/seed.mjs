// Seeds the Synapse of test/e2e-schedule/synapse.sh for test/e2e-app/run.mjs: a public space
// (#testspace) with two rooms (#general, #random), a DM between alice and bob, and messages of the
// kinds the timeline renders differently (formatted text, code, a reply, a reaction, an edit, a
// mention). Run again, it changes nothing: it stops when #testspace exists.
//
//   node test/e2e-app/seed.mjs [http://localhost:8448]
const BASE = process.argv[2] ?? 'http://localhost:8448';
const SERVER = 'localhost';

let txn = 0;
const api = async (token, method, path, body) => {
  const res = await fetch(`${BASE}/_matrix/client/v3${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body && JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${JSON.stringify(json)}`);
  return json;
};
const enc = encodeURIComponent;

const existing = await fetch(
  `${BASE}/_matrix/client/v3/directory/room/${enc(`#testspace:${SERVER}`)}`
);
if (existing.ok) {
  console.log('already seeded');
  process.exit(0);
}

const login = async (user) => {
  const r = await api(null, 'POST', '/login', {
    type: 'm.login.password',
    identifier: { type: 'm.id.user', user },
    password: `${user}-password`,
    initial_device_display_name: 'e2e-app seed',
  });
  return { userId: r.user_id, token: r.access_token };
};
const send = (t, room, content, type = 'm.room.message') => {
  txn += 1;
  return api(t, 'PUT', `/rooms/${enc(room)}/send/${type}/seed${Date.now()}-${txn}`, content);
};

const alice = await login('alice');
const bob = await login('bob');

const space = (
  await api(alice.token, 'POST', '/createRoom', {
    name: 'Test Space',
    creation_content: { type: 'm.space' },
    preset: 'public_chat',
    room_alias_name: 'testspace',
    invite: [bob.userId],
  })
).room_id;

const makeRoom = async (name, alias) => {
  const id = (
    await api(alice.token, 'POST', '/createRoom', {
      name,
      topic: `${name} topic`,
      preset: 'public_chat',
      room_alias_name: alias,
      invite: [bob.userId],
    })
  ).room_id;
  await api(alice.token, 'PUT', `/rooms/${enc(space)}/state/m.space.child/${enc(id)}`, {
    via: [SERVER],
  });
  await api(alice.token, 'PUT', `/rooms/${enc(id)}/state/m.space.parent/${enc(space)}`, {
    via: [SERVER],
    canonical: true,
  });
  return id;
};
const general = await makeRoom('General', 'general');
const random = await makeRoom('Random', 'random');
for (const r of [space, general, random]) await api(bob.token, 'POST', `/join/${enc(r)}`, {});

const dm = (
  await api(alice.token, 'POST', '/createRoom', {
    is_direct: true,
    preset: 'trusted_private_chat',
    invite: [bob.userId],
  })
).room_id;
await api(bob.token, 'POST', `/join/${enc(dm)}`, {});
await api(alice.token, 'PUT', `/user/${enc(alice.userId)}/account_data/m.direct`, {
  [bob.userId]: [dm],
});
await api(bob.token, 'PUT', `/user/${enc(bob.userId)}/account_data/m.direct`, {
  [alice.userId]: [dm],
});

const first = await send(bob.token, general, { msgtype: 'm.text', body: 'Hello from Bob' });
for (let i = 1; i <= 40; i += 1) {
  await send(i % 2 ? alice.token : bob.token, general, {
    msgtype: 'm.text',
    body: `Message number ${i}`,
  });
}
await send(alice.token, general, {
  msgtype: 'm.text',
  body: '**bold** and `code`',
  format: 'org.matrix.custom.html',
  formatted_body:
    '<strong>bold</strong> and <code>code</code> and <a href="https://example.org">a link</a>',
});
await send(alice.token, general, {
  msgtype: 'm.text',
  body: '```js\nconst x = 1;\n```',
  format: 'org.matrix.custom.html',
  formatted_body: '<pre><code class="language-js">const x = 1;\n</code></pre>',
});
await send(alice.token, general, {
  msgtype: 'm.text',
  body: '> Hello from Bob\n\nreplying',
  'm.relates_to': { 'm.in_reply_to': { event_id: first.event_id } },
});
await send(
  alice.token,
  general,
  { 'm.relates_to': { rel_type: 'm.annotation', event_id: first.event_id, key: '👍' } },
  'm.reaction'
);
const toEdit = await send(bob.token, general, { msgtype: 'm.text', body: 'typo mesage' });
await send(bob.token, general, {
  msgtype: 'm.text',
  body: '* fixed message',
  'm.new_content': { msgtype: 'm.text', body: 'fixed message' },
  'm.relates_to': { rel_type: 'm.replace', event_id: toEdit.event_id },
});
await send(bob.token, general, {
  msgtype: 'm.text',
  body: `hi ${alice.userId}`,
  format: 'org.matrix.custom.html',
  formatted_body: `hi <a href="https://matrix.to/#/${alice.userId}">Alice</a>`,
  'm.mentions': { user_ids: [alice.userId] },
});
await send(bob.token, random, { msgtype: 'm.text', body: 'Random chatter' });
await send(bob.token, dm, { msgtype: 'm.text', body: 'Hey Alice, a direct message' });

console.log('seeded', { space, general, random, dm });
