'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export function EasterEgg() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname.startsWith('/blog/')) return;

    const s0 = 'color:#27272a;font-family:monospace;font-size:11px';
    const s1 = 'color:#3f3f46;font-family:monospace;font-size:10px';
    const s2 = 'color:#18181b;font-family:monospace;font-size:9px';

    const t1 = setTimeout(() => console.log('%c· · ·', s0), 600);
    const t2 = setTimeout(
      () => console.log('%csomething you never said out loud?', s1),
      1800
    );
    const t3 = setTimeout(() => console.log('%c. . .', s2), 3200);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [pathname]);

  return null;
}
