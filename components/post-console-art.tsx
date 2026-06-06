'use client';

import { useEffect } from 'react';

const dim = 'color:#3f3f46;font-family:monospace;font-size:11px;line-height:1.4';
const fade = 'color:#52525b;font-family:monospace;font-size:10px';

const art: Record<string, { lines: string; caption: string }> = {
  'ambition-is-a-bug': {
    lines: `                ⠤⡄⡶⡶⡶⡶⣾⣿⣿⣿⡶⡶⣿⣿⣿⣿⡶⠆
               ⢰⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷
               ⢼⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠇
              ⠠⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡠
        ⠀⡔⡤⡄⠀⠀⢼⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⡄⠀⠀⠠⡴⠆
        ⠘⠿⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠀
         ⠀⠃⠇⣿⣿⣿⣾⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣾⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿
           ⠀⠘⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠏
             ⠒⢇⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣳
              ⠀⡲⣿⣿⠖⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡳
               ⠀⡸⢆⡘⠘⠀⠀⠀⠘⢂⡰⢆⣸⣄⣤⣴⣘⠈⠀⡰⣄⢃⣰
                 ⠘⣷⠀⢰⣿⣿⣿⣾⣾⣿⣿⣿⣷⠁⠄⠠⠃
                 ⠘⣷⠀⠈⠍⠘⠀⠐⠐⠐⠐⠐⠂⠘⠠⠏
                  ⠘⣷⠁         ⠠⠋
                   ⠐⡖⣦⠤⠀⠀⠀⠀⠠⠖⠢⠃                    `,
    caption: `"i did it for me. i liked it."`,
  },
  'indian-food-chai-and-soft-power': {
    lines: `
      )  )  )
     (  (  (
   .----------.
   |  c h a i |
   |  ~~~~~~  |
   '----------'
       |  |`,
    caption: `culture is a soft weapon.`,
  },
  'religion-socially-accepted-cult-with-prolonged-brainwashing-and-imposition': {
    lines: `
      +       +       +
     /|\\     /|\\     /|\\
    / | \\   / | \\   / | \\
   /  |  \\ /  |  \\ /  |  \\
  '---+---X---+---X---+---'
      |       |       |`,
    caption: `same story. different costume.`,
  },
  'we-have-to-export-indian-culture-to-a-non-diaspora-audience': {
    lines: `
    .-----------.
    |  I N D I A |
    |     ->     |
    |   W O R L D|
    '-----------'
         |||
     ____|_|____`,
    caption: `the world isn't ready. send it anyway.`,
  },
};

export function PostConsoleArt({ slug }: { slug: string }) {
  useEffect(() => {
    const entry = art[slug];
    if (!entry) return;
    console.clear();
    console.log('%c' + entry.lines, dim);
    setTimeout(() => console.log('%c' + entry.caption, fade), 800);
  }, [slug]);

  return null;
}
