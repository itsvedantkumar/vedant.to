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

const art: Record<string, { lines: string; caption: string }> = {
  'ambition-is-a-bug': {
    lines: heisenberg,
    caption: `"i did it for me. i liked it."`,
  },
  'indian-food-chai-and-soft-power': {
    lines: teaArt,
    caption: `culture is a soft weapon.`,
  },
  'religion-socially-accepted-cult-with-prolonged-brainwashing-and-imposition': {
    lines: crossArt,
    caption: `same story. different costume.`,
  },
  'we-have-to-export-indian-culture-to-a-non-diaspora-audience': {
    lines: indiaMap,
    caption: `the world isn't ready. send it anyway.`,
  },
};

/**
 * Deterministic sigil for any slug without hand-drawn art.
 *
 * The curated pieces above are jokes about four specific posts, and they do
 * not generalise -- there is no fifth drawing that means something about an
 * arbitrary daily entry. So every other slug gets a generated glyph instead of
 * nothing. It is derived from the slug, so a given post always shows the same
 * one, and no two posts collide in practice.
 *
 * FNV-1a for the seed, mulberry32 for the fill. Both are tiny and neither
 * needs to be good cryptography -- this draws a picture.
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

// Captions for generated sigils. Each one is about having opened the console,
// never about the post -- a line picked by hash cannot know what the post says,
// and a caption that guesses would eventually be wrong in an embarrassing way.
const asides = [
  'you opened the console. of course you did.',
  'every entry has one of these. no two are alike.',
  'drawn from the slug. same post, same glyph, always.',
  'the rest of this site is static. this is the one improvised thing.',
  'nothing is hidden down here. that is sort of the joke.',
  'still reading the source? good.',
  'no tracking in this console. just shapes.',
  'this one is yours because you looked.',
];

function aside(slug: string): string {
  return asides[hash32(slug + '\u0000caption') % asides.length];
}

export function PostConsoleArt({ slug }: { slug: string }) {
  useEffect(() => {
    const entry = art[slug];
    const lines = entry ? entry.lines : sigil(slug);
    const caption = entry ? entry.caption : aside(slug);

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
