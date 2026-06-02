import { createMetadata } from '@/lib/metadata';

export const metadata = createMetadata({
  title: 'Now',
  description: 'What I\'m working on right now.',
  path: '/now',
});

export default function NowPage() {
  return (
    <section className="space-y-8">
      <div>
        <h1 className="font-medium text-2xl tracking-tight mb-1">Now</h1>
        <p className="text-gray-500 dark:text-zinc-500 text-sm">Last updated June 2026</p>
      </div>

      <div className="space-y-6 text-gray-800 dark:text-zinc-300 leading-relaxed">
        <div>
          <h2 className="font-medium text-gray-900 dark:text-zinc-100 mb-2">Building</h2>
          <p>
            Working on vedant.to — building in public, writing about what I learn.
          </p>
        </div>

        <div>
          <h2 className="font-medium text-gray-900 dark:text-zinc-100 mb-2">Reading</h2>
          <p>
            Essays. The good ones from Paul Graham, Morgan Housel, and people who write
            like they mean it.
          </p>
        </div>

        <div>
          <h2 className="font-medium text-gray-900 dark:text-zinc-100 mb-2">Thinking about</h2>
          <p>
            How to build things people actually want. What it means to write well.
            Why most software is worse than it needs to be.
          </p>
        </div>
      </div>

      <p className="text-sm text-gray-400 dark:text-zinc-600">
        This is a{' '}
        <a
          href="https://nownownow.com/about"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2"
        >
          now page
        </a>
        .
      </p>
    </section>
  );
}
