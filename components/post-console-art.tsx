'use client';

import { useEffect } from 'react';

const dim = 'color:#3f3f46;font-family:monospace;font-size:11px;line-height:1.4';
const fade = 'color:#52525b;font-family:monospace;font-size:10px';

// source: twitchquotes.com/copypastas/5263
const heisenberg = `⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⠿⠿⠿⠿⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿
⣿⣿⣿⣿⣿⣿⣿⣿⠟⠋⠁⠀⠀⠀⠀⠀⠀⠀⠀⠉⠻⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿
⣿⣿⣿⣿⣿⣿⣿⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢺⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿
⣿⣿⣿⣿⣿⣿⣿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠆⠜⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿
⣿⣿⣿⣿⠿⠿⠛⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠻⣿⣿⣿⣿⣿
⣿⣿⡏⠁⠀⠀⠀⠀⠀⣀⣠⣤⣤⣶⣶⣶⣶⣶⣦⣤⡄⠀⠀⠀⠀⢀⣴⣿⣿⣿⣿⣿
⣿⣿⣷⣄⠀⠀⠀⢠⣾⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⢿⡧⠇⢀⣤⣶⣿⣿⣿⣿⣿⣿⣿
⣿⣿⣿⣿⣿⣿⣾⣮⣭⣿⡻⣽⣒⠀⣤⣜⣭⠐⢐⣒⠢⢰⢸⣿⣿⣿⣿⣿⣿⣿⣿⣿
⣿⣿⣿⣿⣿⣿⣿⣏⣿⣿⣿⣿⣿⣿⡟⣾⣿⠂⢈⢿⣷⣞⣸⣿⣿⣿⣿⣿⣿⣿⣿⣿
⣿⣿⣿⣿⣿⣿⣿⣿⣽⣿⣿⣷⣶⣾⡿⠿⣿⠗⠈⢻⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⠻⠋⠉⠑⠀⠀⢘⢻⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿
⣿⣿⣿⣿⣿⣿⣿⡿⠟⢹⣿⣿⡇⢀⣶⣶⠴⠶⠀⠀⢽⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿
⣿⣿⣿⣿⣿⣿⡿⠀⠀⢸⣿⣿⠀⠀⠣⠀⠀⠀⠀⠀⡟⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿
⣿⣿⣿⡿⠟⠋⠀⠀⠀⠀⠹⣿⣧⣀⠀⠀⠀⠀⡀⣴⠁⢘⡙⢿⣿⣿⣿⣿⣿⣿⣿⣿
⠉⠉⠁⠀⠀⠀⠀⠀⠀⠀⠀⠈⠙⢿⠗⠂⠄⠀⣴⡟⠀⠀⡃⠀⠉⠉⠟⡿⣿⣿⣿⣿
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢷⠾⠛⠂⢹⠀⠀⠀⢡⠀⠀⠀⠀⠀⠙⠛⠿⢿`;

// source: textart.sh/topic/cross
const crossArt = `            ██████████
            ██      ██
            ██      ██
            ██      ██
            ██      ██
██████████████      ██████████████
██                              ██
██                              ██
██████████████      ██████████████
            ██      ██
            ██      ██
            ██      ██
            ██      ██
            ██      ██
            ██      ██
            ██      ██
            ██████████            `;

// source: asciiart.eu/food-and-drinks/coffee-and-tea
const teaArt = `      ( ) ( )
     ) ) ( ) ( (
    ( ( ) ) ( ) )
   __________________
  <__________________|
        | __|
       _| |  |
      | | |  |
      |_| |__|
      |___\\___\\
      /___/___/`;

// source: ascii.co.uk/art/india
const indiaMap = `         .--,\\
        \\['    '\\\\
         \\\\      \`''|
         |         ,\\]
          \`.\\._     \\].
            |     \\\\
          \\_/       -'\\\\
         ,'          ,'
       \\_/'          \\\\
  |--''              '-;\\\\
   \\\\                   \`--.___
   \`\\\\                        \`-'
,--;/
\\_\\_`;

// Every drawing below is about the entry it is keyed to. The rule for adding
// one: read the piece, find the object it keeps circling, draw that object. A
// shape that could sit on any other entry is the wrong shape.

const lips = String.raw`
      .-""-.        .-""-.
    .'      '.    .'      '.
   /          '..'          \
  |__________________________|
   \                        /
    '.                    .'
      '-.              .-'
         '-.________.-'`;

const hourglass = String.raw`
 .--------------.
 |\            /|
 | \   ....   / |
 |  \  ::::  /  |
 |   \ :::: /   |
 |    \::::/    |
 |     \::/     |
 |     /::\     |
 |    /::::\    |
 |   /::::::\   |
 |  /::::::::\  |
 | /::::::::::\ |
 |/____________\|
 '--------------'`;

const rooster = String.raw`
        ,\
        \\\,_
         \' ,\
    __,.-" =__)
  ."        )
,_/   ,    \/\_
\_|    )_-\ \_-'
   '-----' '--'`;

const candle = String.raw`
         (
          )
         (_)
        .' '.
       /     \
       \     /
        '. .'
         '|'
        .---.
        |   |
        |   |
        |   |
       _|___|_
      '-------'`;

const tinCans = String.raw`
  .------.                        .------.
  |======|                        |======|
  |      |                        |      |
  |      |>-.                  .-<|      |
  |      |   '.              .'   |      |
  |______|     '-.________.-'     |______|`;

const middleFinger = String.raw`
      .--.
      |  |
      |  |
      |  |
   .--|  |--.
   |  |  |  |
   |         |
   |         |
    \       /
     '-----'`;

const konami = String.raw`
  .---. .---. .---. .---. .---. .---.
  | ^ | | ^ | | v | | v | | < | | > |
  '---' '---' '---' '---' '---' '---'
  .---. .---. .---. .---.
  | < | | > | | B | | A |
  '---' '---' '---' '---'`;

const indiaGate = String.raw`
        .-----------.
        |  o o o o  |
     .--+-----------+--.
     |                 |
     |   .---------.   |
     |   |         |   |
     |   |         |   |
     |   |         |   |
   .-+---+---------+---+-.
   '---------------------'`;

const movingBox = String.raw`
     ________________
    /               /|
   /_______________/ |
   |    |     |    | |
   |----+-----+----| |
   |    |     |    | /
   |____|_____|____|/`;

const twoBubbles = String.raw`
   .-------------.
   |    . . .    |
   '--\/---------'

               .-------------.
               |    . . .    |
               '---------\/--'`;

const mask = String.raw`
     .-----------------.
    /                   \
   |   .-.         .-.   |
   |  ( o )       ( o )  |
   |   '-'         '-'   |
   |          ^          |
   |                     |
    \    '.._____..'    /
     '-----------------'
        |         |`;

const bed = String.raw`
   .-.
   | |______________________
   | |   .---------------.  |
   | |  (                 ) |
   | |   '---------------'  |
   |_|______________________|_
    | |                    | |`;

const loop = String.raw`
       .--------------.
     .'                '.
    /                    \
   |                      |
   ^                      v
   |                      |
    \                    /
     '.                .'
       '--------------'`;

const burntMatch = String.raw`
       '
      .
     '
    (#)
    /
   /
  /
 '`;

const toilet = String.raw`
      .-------.
     |         |
     |  .---.  |
     |         |
     '----+----'
      .---+---.
     /         \
    |     _     |
    |   .' '.   |
    |  (     )  |
     \  '._.'  /
      '-------'`;

const clapper = String.raw`
   .\_\_\_\_\_\_\_\_\_.
   |/_/_/_/_/_/_/_/_/_|
   |                  |
   |                  |
   |                  |
   '------------------'`;

const deadBattery = String.raw`
   .--------------------.
   |                    |__
   |                    |  |
   |                    |__|
   '--------------------'`;

const passport = String.raw`
    .---------------------.
   |                       |
   |     .-----------.     |
   |     |           |     |
   |     |    ( )    |     |
   |     |   /   \   |     |
   |     '-----------'     |
   |                       |
   |    P A S S P O R T    |
   |                       |
   '-----------------------'`;

const equalizer = String.raw`
    |     |           |
    |  |  |  |     |  |
    |  |  |  |  |  |  |
    |  |  |  |  |  |  |  |
   _|__|__|__|__|__|__|__|_`;

const examTick = String.raw`
   .------------------.
   | ________         |
   | ________      /  |
   | ________     /   |
   |             /    |
   |   \        /     |
   |    \      /      |
   |     \    /       |
   |      \  /        |
   |       \/         |
   '------------------'`;

const crown = String.raw`
    .        .        .
   /_\      /_\      /_\
   | |      | |      | |
   |  \    /   \    /  |
   |   \  /     \  /   |
   |    \/       \/    |
   |    o     o    o   |
   |___________________|
   '==================='`;

const risingChart = String.raw`
  1K |                    .
     |                  .'
     |                .'
     |             .-'
     |         _.-'
     |    _..-'
     |_.-'
     '--------------------`;

const art: Record<string, { lines: string; caption: string }> = {
  // Posts
  'ambition-is-a-bug': {
    lines: heisenberg,
    caption: `i did it for me. i liked it.`,
  },
  'guilt-of-not-working': {
    lines: hourglass,
    caption: `resting spends it too.`,
  },
  'indian-food-chai-and-soft-power': {
    lines: teaArt,
    caption: `culture is a soft weapon.`,
  },
  'is-it-bad-to-be-cocky': {
    lines: rooster,
    caption: `it is only bragging if you are wrong.`,
  },
  'loose-lips-sink-ships': {
    lines: lips,
    caption: `the ship was never the point.`,
  },
  'religion-socially-accepted-cult-with-prolonged-brainwashing-and-imposition': {
    lines: crossArt,
    caption: `same story. different costume.`,
  },
  'starting-young': {
    lines: candle,
    caption: `twice as bright. you know the rest.`,
  },
  'the-case-against-for-human-connection': {
    lines: tinCans,
    caption: `the string only works if both ends pull.`,
  },
  'we-have-to-export-indian-culture-to-a-non-diaspora-audience': {
    lines: indiaMap,
    caption: `the world isn't ready. send it anyway.`,
  },

  // Daily
  '1-july-2026': {
    lines: middleFinger,
    caption: `some days that is the whole entry.`,
  },
  '10-june-2026': {
    lines: konami,
    caption: `community. up up down down.`,
  },
  '11-july-2026': {
    lines: indiaGate,
    caption: `delhi again.`,
  },
  '11-june-2026': {
    lines: movingBox,
    caption: `bangalore. everything i own fit in here.`,
  },
  '17-august-2026': {
    lines: twoBubbles,
    caption: `both of you meant well. neither of you landed it.`,
  },
  '2-july-2026': {
    lines: mask,
    caption: `busy is not the same as working.`,
  },
  '29-june-2026': {
    lines: bed,
    caption: `the bed won today.`,
  },
  '3-july-2026': {
    lines: loop,
    caption: `it comes back on schedule.`,
  },
  '30-june-2026': {
    lines: burntMatch,
    caption: `good company, no light.`,
  },
  '4-july-2026': {
    lines: toilet,
    caption: `it was supposed to be funny.`,
  },
  '5-july-2026': {
    lines: clapper,
    caption: `shipped it anyway.`,
  },
  '7-august-2026': {
    lines: deadBattery,
    caption: `nothing left to perform with.`,
  },
  '7-june-2026': {
    lines: passport,
    caption: `stamped, and still here.`,
  },
  '8-july-2026': {
    lines: equalizer,
    caption: `no words that day. just the playlist.`,
  },
  '8-june-2026': {
    lines: examTick,
    caption: `passed. still felt behind.`,
  },
  '9-july-2026': {
    lines: crown,
    caption: `i always win, sweetheart.`,
  },
  '9-june-2026': {
    lines: risingChart,
    caption: `1,000 in thirty days. we will see.`,
  },
};

/**
 * Fallback for a slug with no drawing yet -- a post published after this file
 * was last touched. It is a placeholder, not a design: the art above is keyed
 * to what each entry is about, and nothing derived from a slug can do that.
 * Add a real drawing when you add a post and this never runs.
 *
 * FNV-1a for the seed, mulberry32 for the fill. Neither needs to be good
 * cryptography -- this draws a picture.
 */
function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Two characters per cell, because a monospace cell is about half as wide as
// it is tall and a one-char grid comes out squashed.
const RAMP = ['  ', '░░', '▒▒', '▓▓', '██'];
const ROWS = 9;
const HALF = 5;

function sigil(slug: string): string {
  const rnd = mulberry32(hash32(slug));
  const rows: string[] = [];
  for (let y = 0; y < ROWS; y++) {
    const half: string[] = [];
    for (let x = 0; x < HALF; x++) {
      half.push(rnd() < 0.42 ? RAMP[0] : RAMP[1 + Math.floor(rnd() * 4)]);
    }
    // Mirror around the last column so the glyph reads as one shape rather
    // than as noise. Dropping that column from the reversed half keeps the
    // centre from doubling.
    rows.push([...half, ...half.slice(0, -1).reverse()].join(''));
  }
  return rows.join('\n');
}

export function PostConsoleArt({ slug }: { slug: string }) {
  useEffect(() => {
    const entry = art[slug];
    // The String.raw drawings open on a newline so the first row lines up with
    // the rest in the source. Drop it so every piece starts flush in the log.
    const lines = (entry ? entry.lines : sigil(slug)).replace(/^\n/, '');
    const caption = entry ? entry.caption : 'no drawing for this one yet.';

    // No console.clear() here. It used to run, back when this fired on four
    // posts. Now it fires on every post and every daily entry, and clearing a
    // visitor's console on every page view is hostile -- it would also wipe
    // the EasterEgg logs from app/layout.tsx, which mount site-wide.
    console.log('%c' + lines, dim);
    const t = setTimeout(() => console.log('%c' + caption, fade), 800);
    return () => clearTimeout(t);
  }, [slug]);

  return null;
}
