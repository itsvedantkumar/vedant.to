'use client';

import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';

type MascotState = 'intro' | 'idle' | 'thinking' | 'success' | 'error' | 'hover';

export interface MascotRef {
  setState: (newState: MascotState) => void;
}

const FRAMES: Record<MascotState, { text: string[]; duration: number }> = {
  intro: {
    duration: 300,
    text: [
      '(•_•)\n /|\\\n / \\',
      '( •_•)>⌐■-■\n  |\\\n / \\',
      '(⌐■_■)\n /|\\\n / \\',
      '(⌐■_■)\n  |_\n / \\'
    ]
  },
  idle: {
    duration: 250,
    text: [
      '(•_•)\n /|\\\n / \\',
      '(•_•)\n \\|/\n / \\',
      '(•_•)\n /|\\\n / \\',
      '(•_•)\n /|\\\n /\\'
    ]
  },
  thinking: {
    duration: 300,
    text: [
      '(•_•)\n /|\\\n / \\   ',
      '(¬_¬)\n /|\\\n / \\   ',
      '(•_•)\n /|\\\n / \\   ',
      '(•_•)\n /|\\\n / \\   '
    ]
  },
  success: {
    duration: 200,
    text: [
      '(⌐■_■)\n \\|/\n / \\',
      '(⌐■_■) ✦\n \\|/\n / \\',
      '(⌐■_■)\n /|\\\n / \\'
    ]
  },
  error: {
    duration: 400,
    text: [
      '(×_×)\n /|\\\n / \\',
      '(•_•)~\n /|\\\n / \\',
      '(•_-)\n /|\\\n / \\'
    ]
  },
  hover: {
    duration: 300,
    text: [
      '(•_•)\n /|\\\n / \\',
      '(¬‿¬)\n /|\\\n / \\'
    ]
  }
};

export const Mascot = forwardRef<MascotRef>((props, ref) => {
  const preRef = useRef<HTMLPreElement>(null);
  const [currentState, setCurrentState] = useState<MascotState>('idle');
  const frameIndexRef = useRef(0);
  const loopCountRef = useRef(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Keep track of current state in a ref to avoid stale closures in imperative handle
  const stateRef = useRef<MascotState>('idle');
  useEffect(() => {
    stateRef.current = currentState;
  }, [currentState]);

  // Expose API to parent components
  useImperativeHandle(ref, () => ({
    setState: (newState: MascotState) => {
      const current = stateRef.current;
      // Priority overrides (prevent soft states from overriding hard states)
      if (current === 'intro') return; // Intro is unskippable
      if (current === 'error' && newState !== 'idle') return; // Error blocks until reset
      if (current === 'success' && (newState === 'thinking' || newState === 'hover')) return;
      if (current === 'thinking' && newState === 'hover') return; // Don't hover while loading

      setCurrentState(newState);
    }
  }));

  // Initialization (Intro check)
  useEffect(() => {
    const hasSeenIntro = localStorage.getItem('mascot_intro_seen');
    if (!hasSeenIntro) {
      setCurrentState('intro');
      localStorage.setItem('mascot_intro_seen', 'true');
    }
  }, []);

  // Main animation engine
  useEffect(() => {
    // Reset counters on state change
    frameIndexRef.current = 0;
    loopCountRef.current = 0;

    const tick = () => {
      const config = FRAMES[currentState];
      const frames = config.text;

      // Update DOM directly for maximum 60FPS performance (bypassing React)
      if (preRef.current) {
        // Special logic for thinking dots
        let text = frames[frameIndexRef.current];
        if (currentState === 'thinking') {
          const dots = '.'.repeat((frameIndexRef.current % 3) + 1);
          // Pad with spaces to prevent layout shift
          const paddedDots = dots.padEnd(3, ' ');
          text = text.replace(/   $/, paddedDots);
        }
        preRef.current.innerText = text;
      }

      // Progress frame
      frameIndexRef.current++;

      // Handle end of animation loops
      if (frameIndexRef.current >= frames.length) {
        frameIndexRef.current = 0;
        loopCountRef.current++;

        // State Machine transitions
        if (currentState === 'intro') {
          setCurrentState('idle');
          return;
        }
        if (currentState === 'success' && loopCountRef.current >= 2) {
          setCurrentState('idle');
          return;
        }
        if (currentState === 'error' && loopCountRef.current >= 1) {
          setCurrentState('idle');
          return;
        }
      }

      timeoutRef.current = setTimeout(tick, config.duration);
    };

    tick();

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [currentState]);

  return (
    <pre
      ref={preRef}
      className="font-mono text-[13px] leading-tight text-gray-800 dark:text-neutral-400 opacity-90 transition-opacity duration-100 my-6 !bg-transparent !p-0 !m-0 !border-0"
      style={{
        width: '120px',
        height: '65px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        whiteSpace: 'pre',
        margin: '1rem auto',
        overflow: 'hidden'
      }}
      onMouseEnter={() => {
        if (currentState === 'idle') setCurrentState('hover');
      }}
      onMouseLeave={() => {
        if (currentState === 'hover') setCurrentState('idle');
      }}
    />
  );
});

Mascot.displayName = 'Mascot';
