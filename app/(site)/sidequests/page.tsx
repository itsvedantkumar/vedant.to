import type { Metadata } from 'next';
import { createMetadata } from '@/lib/metadata';
import { ASSETS_URL, IAF_PROFILE_URL, OLD_BLOG_URL, SOCIAL_LINKS } from '@/lib/constants';
import { Redacted } from '@/components/redacted';

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
const PC_BUILD = 'https://pcpartpicker.com/user/vkworkofficial/saved/#view=wWrbwP';
const BALATRO = 'https://store.steampowered.com/app/2379780/Balatro/';
const CGPA_IMAGE = `${ASSETS_URL}/i/sidequests/cgpa-sem2.webp`;
const RAGEBAIT_POST = SOCIAL_LINKS.x
  ? `${SOCIAL_LINKS.x}/status/2069843036297945598?s=20`
  : null;
const INSTAGRAM = SOCIAL_LINKS.instagram;
const YOUTUBE = SOCIAL_LINKS.youtube;

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
        <Section title="In 8th grade (2020):">
          <li>
            Spent 6 months researching parts to assemble{' '}
            <ExternalLink href={PC_BUILD}>my first computer</ExternalLink> (not that
            crazy, I know), in the end literally started crying out of indecision over AMD
            (Ryzen 3600) or Intel, lol
          </li>
          <li>
            Got the chance to partner with India&apos;s biggest law firm for my Online IP
            Marketplace bs startup
          </li>
        </Section>

        <Section title="In 9th grade (2021):">
          <li>
            Lost ~30 KGs weight in 2 months by starving myself (completely), rigorous
            sports, literally have -ve Vitamin D levels (trust me, lol). This was{' '}
            <ExternalLink href={BEFORE_PHOTOS}>me before</ExternalLink>
          </li>
          <li>
            Convinced my e-relationship to fly from Europe to come <em>spend a month</em>{' '}
            with me in Delhi (iykwim)
          </li>
          <li>Became madly obsessed with chess, got 1800 ELO in Blitz</li>
        </Section>

        <Section title="In 10th grade (2022):">
          <li>
            Convinced my, umm, <em>older</em> situationship to get me an Internship at her
            friend&apos;s company (iykyk)
          </li>
          <li>
            Published <ExternalLink href={POETRY}>poetry</ExternalLink> in international
            magazines, getting ~150k eyeballs + published hardcopy
          </li>
          <li>
            Got a <ExternalLink href={IAF_PROFILE_URL}>ton of attention</ExternalLink> for
            my shit &ldquo;social venture&rdquo; lol
          </li>
        </Section>

        <Section title="In 11th grade (2023):">
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
          <li>
            <Redacted id="interns" />
          </li>
          <li>Almost got sued by IIM Indore, and Amity Noida</li>
        </Section>

        <Section title="In 12th grade (2024):">
          <li>
            Got an investment offer of $200k from the biggest Consumer VC fund in India
          </li>
          <li>Got cancelled again, this time for sorta valid reasons, lol</li>
        </Section>

        <Section title="In Freshman Year (2025):">
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
          <li>
            0.1% <ExternalLink href={BALATRO}>Balatro</ExternalLink> Player Globally (by
            high score)
          </li>
          <li>
            Was a linkedin influencer for a while, consistently got 100k views per day for
            2 months (made DU-related content)
          </li>
          <li>
            Made a very <ExternalLink href={OLD_BLOG_URL}>emo blog</ExternalLink> (yes, I
            had an <em>even more</em> emo blog)
          </li>
          <li>
            Published some dumb{' '}
            {YOUTUBE ? (
              <ExternalLink href={YOUTUBE}>YouTube videos</ExternalLink>
            ) : (
              'YouTube videos'
            )}
          </li>
        </Section>

        <Section title="In Sophomore Year (2026):">
          <li>Exit process for Dublieu (mainquest)</li>
          <li>Led growth at a HF0 company</li>
          <li>Was backed by an a16z scout for a project, got 2 term sheets for $500k</li>
          <li>
            {RAGEBAIT_POST ? (
              <ExternalLink href={RAGEBAIT_POST}>Ragebaited</ExternalLink>
            ) : (
              'Ragebaited'
            )}{' '}
            Bangalore TT + went viral on IG too
          </li>
          <li>Burnt $20k in Anthropic credits in one day lol</li>
          <li>
            <ExternalLink href={CGPA_IMAGE}>My CGPA was 1.23</ExternalLink> lol
          </li>
          <li>Earned $50k in two weeks in August (ifykyk)</li>
          <li>
            <Redacted id="birthday" />
          </li>
        </Section>
      </div>
    </div>
  );
}
