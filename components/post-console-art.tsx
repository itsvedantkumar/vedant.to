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

export function PostConsoleArt({ slug }: { slug: string }) {
  useEffect(() => {
    const entry = art[slug];
    if (!entry) return;
    console.clear();
    console.log('%c' + entry.lines, dim);
    const t = setTimeout(() => console.log('%c' + entry.caption, fade), 800);
    return () => clearTimeout(t);
  }, [slug]);

  return null;
}
