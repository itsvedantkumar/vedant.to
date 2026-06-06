'use client';

import { useEffect } from 'react';

export function EasterEgg() {
  useEffect(() => {
    const s0 = 'color:#27272a;font-family:monospace;font-size:11px';
    const s1 = 'color:#3f3f46;font-family:monospace;font-size:10px';
    const s2 = 'color:#18181b;font-family:monospace;font-size:9px';

    setTimeout(() => console.log('%c· · ·', s0), 600);
    setTimeout(() => console.log('%csomething you never said out loud?', s1), 1800);
    setTimeout(() => console.log('%c. . .', s2), 3200);
  }, []);

  return null;
}
