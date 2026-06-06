'use client';

import { useEffect } from 'react';

export function EasterEgg() {
  useEffect(() => {
    const art = `
%c
  ┌──────────────────────────────────────┐
  │                                      │
  │   psst.                              │
  │                                      │
  │   got something to say?              │
  │   something you'd never say out loud?│
  │                                      │
  │   ➜  vedant.to/whisper               │
  │                                      │
  │   fully anonymous. always.           │
  │                                      │
  └──────────────────────────────────────┘
`;
    console.log(
      art,
      'color: #71717a; font-family: monospace; font-size: 12px; line-height: 1.4;'
    );
  }, []);

  return null;
}
