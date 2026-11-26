// Seeds the Synapse of test/e2e-schedule/synapse.sh with the showcase account of ./showcase.mjs,
// for the README pictures (./showcase-capture.mjs): Hector and six friends with avatars, ten rooms
// and direct chats with conversations, Home's sidebar sections, unread messages and a mention, a
// draft, three scheduled messages and a sticker pack.
//
//   node test/e2e-app/showcase-seed.mjs [http://localhost:8448]
//
// Messages are sent through the application service synapse.sh registers, as their senders and
// with the timestamps showcase.mjs gives them. Run again, it changes nothing: its last step names
// the picnic room #showcase-picnic, and it stops at the start when that name exists. A run that
// failed part way leaves no name, so start again from a fresh Synapse (synapse.sh down, up).
import crypto from 'node:crypto';
import {
  ROOMS,
  PEOPLE,
  SECTIONS,
  PACK_NAME,
  DRAFT,
  SCHEDULED,
  SERVER,
  PASSWORD_SUFFIX,
  ME,
  NOW,
  at,
} from './showcase.mjs';
import { stickers, picnicPhoto, avatar } from './showcase-art.mjs';

const BASE = process.argv[2] ?? 'http://localhost:8448';
const AS_TOKEN = 'iris-showcase-as'; // test/e2e-schedule/synapse.sh
const SHARED_SECRET = 'iris-e2e-schedule'; // the same
const enc = encodeURIComponent;
const mxid = (user) => `@${user}:${SERVER}`;

const request = async (method, url, { body, raw, type } = {}) => {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${AS_TOKEN}`,
      'Content-Type': type ?? 'application/json',
    },
    body: raw ?? (body && JSON.stringify(body)),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${url}: ${res.status} ${JSON.stringify(json)}`);
  return json;
};
/** A client-server call made as `user`, at time `ts` if given. */
const as = (user, method, path, body, ts, extra = {}) => {
  const q = new URLSearchParams({ user_id: mxid(user), ...extra });
  if (ts !== undefined) q.set('ts', String(ts));
  return request(method, `${BASE}/_matrix/client/v3${path}?${q}`, { body });
};
const upload = async (user, name, png) =>
  (
    await request(
      'POST',
      `${BASE}/_matrix/media/v3/upload?filename=${enc(name)}&user_id=${enc(mxid(user))}`,
      { raw: png, type: 'image/png' }
    )
  ).content_uri;
const pngSize = (png) => ({ w: png.readUInt32BE(16), h: png.readUInt32BE(20) });

const marker = await fetch(
  `${BASE}/_matrix/client/v3/directory/room/${enc(`#${ROOMS[0].alias}:${SERVER}`)}`
);
if (marker.ok) {
  console.log('already seeded');
  process.exit(0);
}

// ---- people -----------------------------------------------------------------------------------
const register = async (user) => {
  const { nonce } = await (await fetch(`${BASE}/_synapse/admin/v1/register`)).json();
  const password = user + PASSWORD_SUFFIX;
  const mac = crypto
    .createHmac('sha1', SHARED_SECRET)
    .update([nonce, user, password, 'notadmin'].join('\0'))
    .digest('hex');
  const res = await fetch(`${BASE}/_synapse/admin/v1/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nonce, username: user, password, admin: false, mac }),
  });
  const json = await res.json();
  if (!res.ok && json.errcode !== 'M_USER_IN_USE') {
    throw new Error(`register ${user}: ${res.status} ${JSON.stringify(json)}`);
  }
};
for (const [user, p] of Object.entries(PEOPLE)) {
  await register(user);
  await as(user, 'PUT', `/profile/${enc(mxid(user))}/displayname`, { displayname: p.name });
  const url = await upload(user, `${user}.png`, avatar(p.hue, p.mark));
  await as(user, 'PUT', `/profile/${enc(mxid(user))}/avatar_url`, { avatar_url: url });
}

// ---- stickers ---------------------------------------------------------------------------------
const pack = { pack: { display_name: PACK_NAME, usage: ['sticker'] }, images: {} };
for (const s of stickers()) {
  const { w, h } = pngSize(s.png);
  pack.images[s.shortcode] = {
    url: await upload(ME, `${s.shortcode}.png`, s.png),
    body: s.body,
    usage: ['sticker'],
    info: { w, h, mimetype: 'image/png', size: s.png.length },
  };
}
await as(ME, 'PUT', `/user/${enc(mxid(ME))}/account_data/im.ponies.user_emotes`, pack);

// ---- rooms ------------------------------------------------------------------------------------
// All state first, messages after: a state event carries the real time, and would land among the
// messages with a date from today.
const ids = {};
const direct = {};
for (const room of ROOMS) {
  const creator = room.direct ? ME : room.creator ?? ME;
  const members = room.direct ? [ME, room.direct] : room.members;
  const initialState = [];
  if (room.avatar) {
    const url = await upload(creator, `${room.key}.png`, avatar(room.avatar.hue, room.avatar.mark));
    initialState.push({ type: 'm.room.avatar', state_key: '', content: { url } });
  }
  const { room_id: id } = await as(creator, 'POST', '/createRoom', {
    preset: room.direct ? 'trusted_private_chat' : 'private_chat',
    initial_state: initialState,
    ...(room.direct ? { is_direct: true } : { name: room.name }),
    ...(room.topic && { topic: room.topic }),
    invite: members.filter((m) => m !== creator).map(mxid),
  });
  for (const m of members) if (m !== creator) await as(m, 'POST', `/join/${enc(id)}`, {});
  ids[room.key] = id;
  if (room.direct) {
    (direct[mxid(room.direct)] ??= []).push(id);
    await as(room.direct, 'PUT', `/user/${enc(mxid(room.direct))}/account_data/m.direct`, {
      [mxid(ME)]: [id],
    });
  }
  for (const [i, tag] of room.tags.entries()) {
    await as(ME, 'PUT', `/user/${enc(mxid(ME))}/rooms/${enc(id)}/tags/${enc(tag)}`, {
      order: (ROOMS.indexOf(room) + i) / 100,
    });
  }
}
await as(ME, 'PUT', `/user/${enc(mxid(ME))}/account_data/m.direct`, direct);
await as(ME, 'PUT', `/user/${enc(mxid(ME))}/account_data/house.mouseion.sidebar`, {
  sections: SECTIONS,
});

// ---- messages ---------------------------------------------------------------------------------
const photo = picnicPhoto();
let txn = 0;
for (const room of ROOMS) {
  const id = ids[room.key];
  const events = {};
  let last;
  for (const m of room.messages) {
    const ts = at(m.at);
    let type = 'm.room.message';
    let content;
    if (m.react) {
      type = 'm.reaction';
      content = {
        'm.relates_to': { rel_type: 'm.annotation', event_id: events[m.to], key: m.react },
      };
    } else if (m.sticker) {
      type = 'm.sticker';
      const s = pack.images[m.sticker];
      content = { body: s.body, url: s.url, info: s.info };
    } else if (m.image) {
      const { w, h } = pngSize(photo);
      content = {
        msgtype: 'm.image',
        body: m.text,
        url: await upload(m.from, m.text, photo),
        info: { w, h, mimetype: 'image/png', size: photo.length },
      };
    } else {
      content = { msgtype: 'm.text', body: m.text };
      let html = m.html;
      if (m.mention) {
        const name = PEOPLE[m.mention].name;
        html = m.text.replace(name, `<a href="https://matrix.to/#/${mxid(m.mention)}">${name}</a>`);
        content['m.mentions'] = { user_ids: [mxid(m.mention)] };
      }
      if (html) Object.assign(content, { format: 'org.matrix.custom.html', formatted_body: html });
    }
    if (m.reply) content['m.relates_to'] = { 'm.in_reply_to': { event_id: events[m.reply] } };
    txn += 1;
    const { event_id: eventId } = await as(
      m.from,
      'PUT',
      `/rooms/${enc(id)}/send/${type}/showcase-${txn}`,
      content,
      ts
    );
    if (m.id) events[m.id] = eventId;
    if (!m.react) last = { eventId, ts };
  }
  // what Hector has read: up to readTo, else everything
  const read = room.readTo ? events[room.readTo] : last.eventId;
  await as(ME, 'POST', `/rooms/${enc(id)}/read_markers`, {
    'm.fully_read': read,
    'm.read': read,
  });
}

// ---- the draft --------------------------------------------------------------------------------
await as(
  ME,
  'PUT',
  `/user/${enc(mxid(ME))}/rooms/${enc(ids[DRAFT.room])}/account_data/house.mouseion.draft`,
  {
    ts: NOW - 5 * 60 * 1000,
    device: 'showcase-seed',
    msg: [{ type: 'paragraph', children: [{ text: DRAFT.text }] }],
  }
);

// ---- scheduled messages -----------------------------------------------------------------------
// The delay runs from now, real time; the capture shows each as if scheduled at NOW, so its send
// time is the one given here.
for (const m of SCHEDULED.messages) {
  txn += 1;
  await as(
    ME,
    'PUT',
    `/rooms/${enc(ids[SCHEDULED.room])}/send/m.room.message/showcase-${txn}`,
    { msgtype: 'm.text', body: m.text },
    undefined,
    { 'org.matrix.msc4140.delay': String(m.send - NOW) }
  );
}

// the marker, last
await as(ME, 'PUT', `/directory/room/${enc(`#${ROOMS[0].alias}:${SERVER}`)}`, {
  room_id: ids[ROOMS[0].key],
});
console.log('seeded', ids);
