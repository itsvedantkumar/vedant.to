import React from 'react';

export default function AsciiArt() {
  const ascii = String.raw`                           /$$                       /$$
                          | $$                      | $$
 /$$    /$$ /$$$$$$   /$$$$$$$  /$$$$$$  /$$$$$$$  /$$$$$$
|  $$  /$$//$$__  $$ /$$__  $$ |____  $$| $$__  $$|_  $$_/
 \  $$/$$/| $$$$$$$$| $$  | $$  /$$$$$$$| $$  \ $$  | $$
  \  $$$/ | $$_____/| $$  | $$ /$$__  $$| $$  | $$  | $$ /$$
   \  $/  |  $$$$$$$|  $$$$$$$|  $$$$$$$| $$  | $$  |  $$$$/
    \_/    \_______/ \_______/ \_______/|__/  |__/   \___/   `;

  return (
    <div className="whitespace-pre font-mono text-[8px] sm:text-[10px] leading-none mb-4 mx-auto w-fit text-gray-500 dark:text-white overflow-hidden text-left">
      {ascii.split('').map((char, i) => {
        if (char === '$') {
          return (
            <span key={i} className="relative inline-block group cursor-default">
              <span className="group-hover:opacity-0 transition-opacity duration-200">{char}</span>
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none text-[1em]">💲</span>
            </span>
          );
        }
        return <span key={i}>{char}</span>;
      })}
    </div>
  );
}
