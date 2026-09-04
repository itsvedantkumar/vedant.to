import type { Metadata } from 'next';
import { createMetadata } from '@/lib/metadata';
import { ASSETS_URL, IAF_PROFILE_URL, SOCIAL_LINKS } from '@/lib/constants';

export const metadata: Metadata = createMetadata({
  title: 'Sidequests',
  description: "Crazy things I've done.",
  path: '/sidequests',
});

export const revalidate = false;

const LINK =
  'text-blue-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-gray-300 dark:underline dark:underline-offset-2 dark:decoration-gray-800';

const DUBLIEU_IMAGE = `${ASSETS_URL}/i/crazy/dublieu-mun-ranking.webp`;
const BEFORE_PHOTOS =
  'https://drive.google.com/drive/folders/1hIA09EQo1_rO6OPlQ1VsJ_8Ms6PDBAzn?usp=sharing';
const POETRY = 'https://drive.google.com/drive/folders/1-IfQiDQ0nrXMA8aKFT5eKJDQrcUA-ftx';
const INSTAGRAM = SOCIAL_LINKS.instagram;

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={LINK}>
      {children}
    </a>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="font-medium text-gray-800 dark:text-zinc-200 mb-3">{title}</h2>
      <ul className="list-disc pl-5 space-y-2 text-gray-800 dark:text-zinc-300 leading-relaxed">
        {children}
      </ul>
    </div>
  );
}

export default function CrazyPage() {
  return (
    <div>
      <h1 className="font-medium text-2xl mb-10 tracking-tight">Sidequests</h1>

      <div className="space-y-8">
        <Section title="In the 8th grade (2020):">
          <li>
            Spent 6 months researching parts to assemble my first computer (not that
            crazy, I know), in the end literally started crying out of indecision over AMD
            (Ryzen 3600) or Intel, lol
          </li>
          <li>
            Got the chance to partner with India&apos;s biggest law firm for my Online IP
            Marketplace bs startup
          </li>
        </Section>

        <Section title="In the 9th grade (2021):">
          <li>
            Lost ~30 KGs weight in 2 months by starving myself (completely), rigorous
            sports, literally have -ve Vitamin D levels (trust me, lol). This was me
            before: <ExternalLink href={BEFORE_PHOTOS}>Link</ExternalLink>
          </li>
          <li>
            Convinced my e-relationship to fly from Europe to come spend a month with me
            in Delhi (iykwim) 👀
          </li>
        </Section>

        <Section title="In the 10th grade (2022):">
          <li>
            Convinced my, umm, older situationship to get me an Internship at her
            friend&apos;s company (iykyk)
          </li>
          <li>
            Published <ExternalLink href={POETRY}>poetry</ExternalLink> in internationally
            magazines, getting ~150k eyeballs + published hardcopy
          </li>
          <li>
            Got a <ExternalLink href={IAF_PROFILE_URL}>ton of attention</ExternalLink> for
            my shit &ldquo;social venture&rdquo; lol
          </li>
        </Section>

        <Section title="In the 11th grade (2023):">
          <li>
            Started Dublieu, became the{' '}
            <ExternalLink href={DUBLIEU_IMAGE}>
              biggest platform for MUNs in India
            </ExternalLink>
          </li>
          <li>
            Got cancelled over fake screenshots from someone cause we parted ways
            professionally lol
          </li>
          <li>
            Managed a team of ~150 concurrent interns, and ~1100 interns over the course
            of the company
          </li>
          <li>Almost goes sued by IIM Indore, and Amity Uni Noida</li>
        </Section>

        <Section title="In the 12th grade (2024):">
          <li>
            Got an investment offer of $200k from the biggest Consumer VC fund in India
          </li>
          <li>Got cancelled again, this time for sorta valid reasons, lol</li>
        </Section>

        <Section title="1st year (2025):">
          <li>Studied for CUET &amp; got an AIR of &lt;400, got into Hindu College</li>
          <li>
            Made{' '}
            {INSTAGRAM ? (
              <ExternalLink href={INSTAGRAM}>content on IG</ExternalLink>
            ) : (
              'content on IG'
            )}{' '}
            for a month, got &gt;20k followers, made $1500 per reel (coaching companies
            pay like crazy lol)
          </li>
          <li>Only wore black color clothes since 3 years, like legit, no kidding</li>
        </Section>
      </div>
    </div>
  );
}
