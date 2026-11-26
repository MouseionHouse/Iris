// The showcase account for the README pictures: who is in it, what they said and when. Shared by
// ./showcase-seed.mjs, which puts it on the local Synapse, and ./showcase-capture.mjs, which
// photographs it. Everything here is made up.
//
// Time is fixed: the browser's clock stands at NOW, and every seeded message carries a timestamp
// set by the seed's application service (test/e2e-schedule/synapse.sh), so the pictures show the
// same times on every run. NOW is in the future on purpose: a room's own creation events carry
// the real time they were made, and the messages must come after them.

/** Friday 16 May 2031, 10:30, in the capture's time zone (TZ). */
export const NOW = Date.UTC(2031, 4, 16, 10, 30);
export const TZ = 'UTC';

/** A time on the fixed day: '09:05' is today, ['08:00', 1] tomorrow. */
export const at = (hhmm, dayOffset = 0) => {
  const [h, m] = hhmm.split(':').map(Number);
  return Date.UTC(2031, 4, 16 + dayOffset, h, m);
};

export const SERVER = 'localhost';
export const PASSWORD_SUFFIX = '-showcase';
/** Signed in to Iris, for the pictures. */
export const ME = 'hector';

// mark: one of showcase-art.mjs's avatarMarks; hue: the avatar's colour
export const PEOPLE = {
  hector: { name: 'Hector', mark: 'shield', hue: 215 },
  andromache: { name: 'Andromache', mark: 'rose', hue: 330 },
  helen: { name: 'Helen', mark: 'wave', hue: 45 },
  nestor: { name: 'Nestor', mark: 'owl', hue: 160 },
  priam: { name: 'Priam', mark: 'crown', hue: 265 },
  odysseus: { name: 'Odysseus', mark: 'ship', hue: 195 },
  patroclus: { name: 'Patroclus', mark: 'star', hue: 20 },
};

/** Home's sidebar: Starred, two sections of Hector's own, then the built-in Chats and Rooms. */
export const SECTIONS = [
  { tag: 'm.favourite', sort: 'recency', filter: 'all', collapsed: false },
  { tag: 'u.Clubs', emoji: '📚', sort: 'recency', filter: 'all', collapsed: false },
  { tag: 'u.Neighbours', emoji: '🌱', sort: 'recency', filter: 'all', collapsed: false },
  { tag: 'chats', sort: 'recency', filter: 'all', collapsed: false },
  { tag: 'rooms', sort: 'alphabetical', filter: 'all', collapsed: false },
];

/** The sticker pack in Hector's account; the stickers are drawn in showcase-art.mjs. */
export const PACK_NAME = 'Doodles';

/*
 * Rooms. A direct chat has `direct` (the other person) and no name; a group room has an avatar,
 * drawn like the people's (a room without one takes a colour from its random ID). Each message is one of:
 *   { from, at, text }               plain text
 *   { from, at, text, html }         formatted
 *   { from, at, image, text }        the picnic picture, `text` its file name
 *   { from, at, sticker }            a sticker from the pack, by shortcode
 *   { from, at, react, to }          a reaction to the message with that `id`
 * and may carry `id` (to be replied or reacted to), `reply` (the id it answers) or `mention`
 * (a user it mentions, whose name in `text` becomes a pill). `readTo` is the id of the last
 * message Hector has read; without it he has read everything.
 */
export const ROOMS = [
  {
    key: 'picnic',
    avatar: { mark: 'sun', hue: 28 },
    name: 'Saturday picnic',
    alias: 'showcase-picnic',
    topic: 'Up the hill, weather permitting',
    members: ['hector', 'andromache', 'helen', 'patroclus', 'odysseus'],
    tags: ['m.favourite'],
    messages: [
      {
        from: 'helen',
        at: '08:42',
        text: 'Forecast says sunshine all Saturday ☀️ Picnic on the hill?',
      },
      { from: 'patroclus', at: '08:44', text: "Yes! I'll bring the frisbee." },
      { from: 'andromache', at: '08:47', text: "Count us in. We'll bring the big blanket." },
      {
        from: 'odysseus',
        at: '08:51',
        text: 'I know a shortcut to the top. Probably.',
        id: 'shortcut',
      },
      {
        from: 'helen',
        at: '08:52',
        text: 'Last time your shortcut took four hours 😅',
        reply: 'shortcut',
        id: 'fourhours',
      },
      { from: 'patroclus', at: '08:53', react: '😂', to: 'fourhours' },
      { from: 'hector', at: '08:54', react: '😂', to: 'fourhours' },
      {
        from: 'hector',
        at: '09:05',
        text: "Who's bringing what so far:\n- Andromache: blanket and lemonade\n- Helen: strawberries\n- Patroclus: frisbee and the speaker\n- Odysseus: directions (we'll see)\n- Me: sandwiches",
        html: "Who's bringing what so far:<ul><li>Andromache: blanket and lemonade</li><li>Helen: strawberries</li><li>Patroclus: frisbee and the speaker</li><li>Odysseus: directions (we'll see)</li><li>Me: sandwiches</li></ul>",
      },
      {
        from: 'patroclus',
        at: '09:12',
        text: "Can someone grab ice? The cooler's empty.",
        id: 'ice',
      },
      {
        from: 'andromache',
        at: '09:14',
        text: "On it, I'll pick some up on the way.",
        reply: 'ice',
      },
      { from: 'helen', at: '09:30', image: true, text: 'picnic.png', id: 'photo' },
      { from: 'helen', at: '09:30', text: "Last year's spot. Same again? 🧺" },
      { from: 'andromache', at: '09:31', react: '❤️', to: 'photo' },
      { from: 'hector', at: '09:33', react: '❤️', to: 'photo' },
      {
        from: 'odysseus',
        at: '09:40',
        text: 'Parking by the hill, for anyone driving: https://example.org/hill-parking',
        html: 'Parking by the hill, for anyone driving: <a href="https://example.org/hill-parking">example.org/hill-parking</a>',
      },
      { from: 'patroclus', at: '10:02', sticker: 'sunny' },
      { from: 'hector', at: '10:15', text: 'Meet at the lower gate at 11?' },
      { from: 'andromache', at: '10:18', text: '11 works 👍' },
    ],
  },
  {
    key: 'andromache',
    direct: 'andromache',
    tags: ['m.favourite'],
    messages: [
      {
        from: 'andromache',
        at: '07:58',
        text: 'Morning ☕ Still up for the market before the picnic?',
      },
      { from: 'hector', at: '08:03', text: "Yes, let's go early. I want the good bread." },
      { from: 'andromache', at: '08:04', text: 'The sourdough stall sells out by nine.' },
      { from: 'hector', at: '08:05', text: 'Then we leave at eight sharp 😄' },
      { from: 'andromache', at: '08:20', sticker: 'coffee' },
      {
        from: 'andromache',
        at: '09:50',
        text: 'Also, your mother called. She wants her lyre back.',
      },
      { from: 'hector', at: '09:52', text: "Tell her it's in tune now, at least.", id: 'tune' },
      { from: 'andromache', at: '09:53', text: "Ha! She'll want proof." },
      {
        from: 'hector',
        at: '10:10',
        text: "I'll play at the picnic. Everyone gets proof.",
        id: 'proof',
      },
      { from: 'andromache', at: '10:12', react: '😂', to: 'proof' },
      {
        from: 'andromache',
        at: '10:24',
        text: "Bring the spare blanket too, it's windy up there.",
      },
    ],
  },
  {
    key: 'reading',
    avatar: { mark: 'book', hue: 250 },
    name: 'Reading circle',
    topic: 'One book a month, opinions all year',
    members: ['nestor', 'hector', 'priam', 'helen'],
    creator: 'nestor',
    tags: ['u.Clubs'],
    readTo: 'agreed',
    messages: [
      {
        from: 'nestor',
        at: '09:00',
        text: "This month's book is Twelve Winters at Sea. How is everyone getting on?",
      },
      {
        from: 'priam',
        at: '09:20',
        text: 'Halfway through. The chapter about the storm is wonderful.',
      },
      { from: 'hector', at: '09:25', text: 'Agreed, I read it twice.', id: 'agreed' },
      { from: 'helen', at: '10:05', text: "No spoilers please, I'm on chapter three!" },
      {
        from: 'nestor',
        at: '10:20',
        text: 'When I was young we read a chapter a night and argued about it until dawn.',
      },
      {
        from: 'nestor',
        at: '10:22',
        text: 'Hector, could you host next week? Your garden has the best chairs.',
        mention: 'hector',
      },
    ],
  },
  {
    key: 'runners',
    avatar: { mark: 'bolt', hue: 350 },
    name: 'Dawn runners',
    members: ['patroclus', 'hector', 'odysseus'],
    creator: 'patroclus',
    tags: ['u.Clubs'],
    readTo: 'picnicday',
    messages: [
      { from: 'patroclus', at: '06:10', text: "5k done 🏃 Who's in tomorrow?" },
      { from: 'hector', at: '06:30', text: "Not tomorrow, it's picnic day!", id: 'picnicday' },
      { from: 'odysseus', at: '09:58', text: 'New route idea: round the harbour and back.' },
      { from: 'patroclus', at: '10:01', text: "Only if it's actually 5k this time." },
    ],
  },
  {
    key: 'helen',
    direct: 'helen',
    tags: ['u.Clubs'],
    readTo: 'enjoy',
    messages: [
      { from: 'helen', at: '07:30', text: 'Thanks for lending me the book!' },
      { from: 'hector', at: '07:35', text: 'Enjoy it! The ending is worth the wait.', id: 'enjoy' },
      { from: 'helen', at: '10:26', text: 'Shall I wash the strawberries tonight or on the day?' },
    ],
  },
  {
    key: 'seeds',
    avatar: { mark: 'leaf', hue: 120 },
    name: 'Seed swap',
    topic: 'Seeds, seedlings and cuttings, free to a good home',
    members: ['priam', 'hector', 'nestor', 'andromache'],
    creator: 'priam',
    tags: ['u.Neighbours'],
    messages: [
      { from: 'priam', at: '08:15', text: 'I have far too many tomato seedlings. Anyone?' },
      { from: 'andromache', at: '08:30', text: "We'll take three!" },
      { from: 'nestor', at: '08:34', sticker: 'sprout' },
      { from: 'hector', at: '08:36', text: "And some basil, if there's any going." },
    ],
  },
  {
    key: 'priam',
    direct: 'priam',
    tags: ['u.Neighbours'],
    messages: [
      { from: 'priam', at: '07:10', text: 'The hedge trimmer is back in your shed. Thank you!' },
      { from: 'hector', at: '07:12', text: 'Any time 🙂' },
    ],
  },
  {
    key: 'patroclus',
    direct: 'patroclus',
    tags: [],
    messages: [
      { from: 'patroclus', at: '08:10', text: 'Morning! My back tyre is flat again.' },
      { from: 'hector', at: '08:12', text: "Again? That's the third time this month." },
      { from: 'patroclus', at: '08:13', text: "There's a thorn in it somewhere, I'm sure." },
      { from: 'hector', at: '08:15', text: "Bring it round on Sunday and we'll fix both bikes." },
      { from: 'patroclus', at: '08:16', text: 'Deal. Yours still squeaks, by the way.' },
      { from: 'hector', at: '08:18', text: "It doesn't squeak, it sings.", id: 'sings' },
      { from: 'patroclus', at: '08:19', react: '😂', to: 'sings' },
      { from: 'hector', at: '08:20', text: 'Do you still have spare inner tubes?' },
      { from: 'patroclus', at: '08:22', text: "Two left. I'll bring them." },
      { from: 'patroclus', at: '09:15', text: 'Still on for Sunday?' },
      { from: 'hector', at: '09:20', text: 'Yes, after lunch.' },
      { from: 'patroclus', at: '09:21', text: "Great, I'll bring tea." },
    ],
  },
  {
    key: 'odysseus',
    direct: 'odysseus',
    tags: [],
    messages: [
      { from: 'odysseus', at: '08:55', text: 'Back from the trip! Long story. Very long.' },
      { from: 'hector', at: '09:00', text: "Can't wait to hear it 😄" },
    ],
  },
  {
    key: 'lyre',
    avatar: { mark: 'note', hue: 290 },
    name: 'Lyre lessons',
    members: ['helen', 'hector', 'priam'],
    creator: 'helen',
    tags: [],
    messages: [
      { from: 'helen', at: '07:45', text: 'Practice is on Tuesday this week 🎶' },
      { from: 'hector', at: '07:50', text: 'Thanks!' },
    ],
  },
];

/** A draft waiting in a room's composer, as Iris keeps it (house.mouseion.draft). */
export const DRAFT = { room: 'patroclus', text: "Bring the spare pump too, mine's" };

/** Messages Hector has scheduled (MSC4140 delayed events), all in one room. */
export const SCHEDULED = {
  room: 'picnic',
  messages: [
    { send: at('08:00', 1), text: "Don't forget the sunscreen 🧴" },
    { send: at('10:40', 1), text: 'Leaving now, see you at the lower gate' },
    { send: at('19:00', 1), text: 'Thank you all for a lovely day ❤️' },
  ],
};
