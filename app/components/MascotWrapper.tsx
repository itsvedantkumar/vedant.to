'use client';

import { useRef, useEffect } from 'react';
import { Mascot, MascotRef } from './Mascot';

export function MascotWrapper() {
  const mascotRef = useRef<MascotRef>(null);

  useEffect(() => {
    // We already fetched posts on the server, so just play the success animation immediately.
    mascotRef.current?.setState('success');
  }, []);

  return (
    <div
      className="w-full flex flex-col items-start justify-start cursor-default"
      onMouseEnter={() => mascotRef.current?.setState('playing')}
    >
      <Mascot ref={mascotRef} />
    </div>
  );
}
