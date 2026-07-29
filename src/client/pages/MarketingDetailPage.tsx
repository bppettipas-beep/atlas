import {
  ArrowRight,
  BookOpen,
  Building,
  Calendar,
  CheckSquare,
  ShieldCheck,
  TreeStructure,
} from '@/components/icons';
import { Logo } from '@/components/Logo';
import { useAuth } from '@/providers/AuthProvider';
import { useEffect } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';

const MARKETING_TABS = [
  ['problem', 'Problem'],
  ['product', 'Product'],
  ['roles', 'Teams'],
  ['details', 'Details'],
  ['pricing', 'Pricing'],
  ['getting-started', 'Start'],
] as const;

const PAGES = {
  problem: {
    index: '01',
    label: 'The problem',
    title: 'Stop running the company from memory.',
    intro:
      'Atlas gives the work, the people, and the way work gets done a shared home. The goal is not more software. It is fewer blind spots.',
    points: [
      ['See responsibility', 'Every person has a place, a role, a team, and clear ownership.'],
      [
        'Catch work early',
        'Deadlines, blockers, approvals, and activity stay visible before they become a crisis.',
      ],
      [
        'Keep know-how',
        'Processes belong to the company, not to the one person who happens to remember them.',
      ],
    ],
    inPractice: [
      [
        'Start with the handoffs',
        'Map the moments where one person has to remember to tell another person something. Those are the first gaps Atlas makes visible.',
      ],
      [
        'Give every job an owner',
        'A task, process, and decision should have a person attached to it. Clarity is less about adding process and more about removing ambiguity.',
      ],
      [
        'Keep the signal in one place',
        'Updates belong beside the work, not buried in a chat thread that only a few people can find later.',
      ],
    ],
    icon: TreeStructure,
  },
  product: {
    index: '02',
    label: 'What Atlas does',
    title: 'The connected picture of your business.',
    intro:
      'Atlas is built around the questions small teams ask all day: who is responsible, what needs doing, when is it happening, and how should it be done?',
    points: [
      [
        'Organisation map',
        'A living structure of people, teams, reporting lines, skills, and ownership.',
      ],
      [
        'Work',
        'Tasks carry the context needed to finish them: subtasks, comments, documents, evidence, and approval.',
      ],
      [
        'Schedule',
        'A clear resource timeline that turns planned work into a practical day for the people doing it.',
      ],
      [
        'Knowledge',
        'Living documents with ownership, version history, and acknowledgement when a process must be read.',
      ],
    ],
    inPractice: [
      [
        'See the whole chain',
        'A job can begin with a person, be assigned to a team, scheduled into a day, and linked to the instructions needed to complete it.',
      ],
      [
        'Work from context',
        'Instead of asking around, the person doing the work can see the notes, documents, attachments, and updates that matter.',
      ],
      [
        'Let the record build itself',
        'Changes, comments, approvals, and completed work stay connected, making the next handoff easier than the last.',
      ],
    ],
    icon: CheckSquare,
  },
  roles: {
    index: '03',
    label: 'Two views, one company',
    title: 'The right amount of information for every role.',
    intro:
      'Owners and managers need the whole operating picture. Workers need a calm, focused view of the work in front of them. Atlas gives both groups a view designed for their job.',
    points: [
      [
        'Owners and managers',
        'See the map, team capacity, blocked work, changing responsibilities, and the company-wide activity record.',
      ],
      [
        'Workers',
        'Use My Day to see assigned work, follow the right process, update progress, and report a blocker or time off.',
      ],
      [
        'Permissions that hold',
        'Access is enforced by the server, so the view is not merely hiding information a person should not access.',
      ],
    ],
    inPractice: [
      [
        'A calm worker day',
        'Workers open a focused list of today’s work instead of a dashboard full of decisions that are not theirs to make.',
      ],
      [
        'A useful manager view',
        'Managers can spot overdue, blocked, unassigned, and scheduled work early enough to do something about it.',
      ],
      [
        'One source of truth',
        'Both views come from the same data, so a worker update is immediately useful to the people coordinating the business.',
      ],
    ],
    icon: Building,
  },
  details: {
    index: '04',
    label: 'Everything else',
    title: 'The details that make a system stick.',
    intro:
      'Good operations software earns trust in the small moments: a notification arriving at the right time, a photo staying with the job, or a recurring task appearing without anyone remembering it.',
    points: [
      [
        'Live updates',
        'Assignments, comments, schedules, and availability update for the people who need to know.',
      ],
      [
        'A reliable record',
        'Activity history records what changed and why, so handoffs do not depend on retelling the story.',
      ],
      [
        'Built for the real world',
        'Attachments, mentions, sign-off, Google sign-in, invitations, and multi-company access fit into the same operating model.',
      ],
    ],
    inPractice: [
      [
        'Updates reach the right people',
        'Assignments, comments, schedule changes, and announcements become notifications in Atlas and can also arrive by email.',
      ],
      [
        'Processes stay usable',
        'A document can be owned, published, revised, and acknowledged, turning “the way we do it” into something people can actually follow.',
      ],
      [
        'Small actions add up',
        'Attachments, mentions, approvals, recurring tasks, and availability are deliberately connected instead of being separate little tools.',
      ],
    ],
    icon: ShieldCheck,
  },
  pricing: {
    index: '05',
    label: 'Pricing',
    title: 'A clear price for a clearer business.',
    intro:
      'Choose the level that suits the way your company works today. Every plan starts with the core Atlas structure: people, work, knowledge, and real-time updates.',
    points: [
      ['Base — $200 / month', 'Organisation map, people, work, knowledge, and real-time updates.'],
      [
        'Growth — $500 / month',
        'Everything in Base, plus manager workflows, approvals, recurring work, and activity history.',
      ],
      [
        'Scale — $1,000 / month',
        'Everything in Growth, multi-company support, and priority onboarding support.',
      ],
    ],
    inPractice: [
      [
        'Start with the plan you need',
        'Every plan begins with the shared operating picture: people, work, knowledge, and live updates in one place.',
      ],
      [
        'Grow without replacing the system',
        'As routines and management needs increase, the same company record can support approvals, recurring work, and richer coordination.',
      ],
      [
        'Know what you are paying for',
        'The price reflects the level of operational support, not a maze of add-ons that makes planning difficult.',
      ],
    ],
    // Pricing copy lives here as data so the page stays easy to update.
    updatedIntro:
      'Choose the Atlas plan that fits your company today, then grow into the next level when your operation needs more room and control.',
    updatedPoints: [
      ['Starter — $19 / month', 'Up to 10 employees, everything included, and perfect for startups.'],
      [
        'Growth — $49 / month',
        'Up to 50 employees, unlimited managers, Atlasy AI, Scheduling, Knowledge Base, Organization Map, and Reporting.',
      ],
      [
        'Business — $99 / month',
        'Up to 150 employees, advanced permissions, analytics, API access, and priority support.',
      ],
      ['Enterprise — custom pricing', 'A tailored plan, onboarding approach, and company scale for complex organizations.'],
    ],
    updatedInPractice: [
      ['Start with the plan you need', 'Starter gives a new company a clear, affordable starting point, while Growth adds the operational tools most teams need every day.'],
      ['Grow without replacing the system', 'Business and Enterprise add deeper control, analytics, integration options, and support as the operation becomes more complex.'],
      ['Know what you are paying for', 'Choose the employee capacity and operational support your company needs, without a maze of add-ons.'],
    ],
    icon: Calendar,
  },
  'getting-started': {
    index: '06',
    label: 'Getting started',
    title: 'Set up the operating picture in an afternoon.',
    intro:
      'Atlas becomes useful quickly because it starts with the things you already know: your company, your people, and the first piece of work that matters.',
    points: [
      ['Create your company', 'Set up the company and become its owner.'],
      [
        'Invite your people',
        'Send invitation codes and add the reporting lines, teams, and responsibilities that matter.',
      ],
      [
        'Put the first job in motion',
        'Assign work, attach the process, schedule it when appropriate, and let the shared picture start doing its work.',
      ],
    ],
    inPractice: [
      [
        'Begin with what is true today',
        'Add the people, teams, and reporting lines you already know. You do not need a perfect org chart to make the first version useful.',
      ],
      [
        'Choose one real workflow',
        'Bring in a current job, assign it, attach the instructions, and let the team use Atlas on something that matters.',
      ],
      [
        'Build in layers',
        'Once the first work is moving, add recurring routines, announcements, schedules, and the company knowledge that makes handoffs reliable.',
      ],
    ],
    icon: BookOpen,
  },
};

Object.assign(PAGES.pricing, {
  intro: PAGES.pricing.updatedIntro,
  points: PAGES.pricing.updatedPoints,
  inPractice: PAGES.pricing.updatedInPractice,
});

export function MarketingDetailPage() {
  const { section } = useParams();
  const { session } = useAuth();
  const page = section ? PAGES[section as keyof typeof PAGES] : undefined;

  // The braces matter. With a concise body this returned whatever scrollTo
  // returns — a Promise in current Chromium — and React takes an effect's
  // return value to be its cleanup function. It then called that Promise on
  // unmount, threw "destroy is not a function", and took the page down with it.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [section]);
  if (!page) return <Navigate to="/" replace />;
  const Icon = page.icon;

  return (
    <div className="min-h-full bg-paper">
      <header className="border-b border-edge bg-paper">
        <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center justify-between gap-y-2 px-5 py-3 sm:px-8">
          <Link to="/" aria-label="Atlas home">
            <Logo markClassName="h-[24px] w-[24px]" wordClassName="text-[15px]" />
          </Link>
          <nav
            className="order-3 flex w-full gap-1 overflow-x-auto pb-0.5 md:order-none md:w-auto md:overflow-visible"
            aria-label="Explore Atlas"
          >
            {MARKETING_TABS.map(([tabSection, label]) => (
              <Link
                key={tabSection}
                to={`/explore/${tabSection}`}
                className={`shrink-0 border-b px-2 py-1.5 text-[12px] font-medium transition-colors ${
                  tabSection === section
                    ? 'border-ink text-ink'
                    : 'border-transparent text-ink-3 hover:border-ink hover:text-ink'
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {session ? (
              <Link
                to="/app"
                className="inline-flex h-8 items-center rounded-sm bg-ink px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-ink-2"
              >
                Open panel
              </Link>
            ) : (
              <>
                <Link
                  to="/signin"
                  className="px-2 py-1.5 text-[13px] font-medium text-ink-2 transition-colors hover:text-ink"
                >
                  Sign in
                </Link>
                <Link
                  to="/start"
                  className="inline-flex h-8 items-center rounded-sm bg-ink px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-ink-2"
                >
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[960px] px-5 py-14 sm:px-8 sm:py-20">
        <div className="border-l-2 border-ink pl-5 sm:pl-7">
          <p className="edge">
            {page.index} · {page.label}
          </p>
          <Icon className="mt-8 text-[28px] text-ink-3" />
          <h1 className="display mt-5 max-w-[16ch] text-[2.7rem] leading-[0.98] sm:text-[4.2rem]">
            {page.title}
          </h1>
          <p className="mt-7 max-w-[58ch] text-[16px] leading-relaxed text-ink-2">{page.intro}</p>
        </div>
        <section className="mt-14 border-t border-edge">
          {page.points.map(([title, body], index) => (
            <article
              key={title}
              className="grid gap-3 border-b border-rule py-7 sm:grid-cols-[52px_1fr]"
            >
              <span className="font-mono text-[11px] text-ink-4">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div>
                <h2 className="title text-[18px]">{title}</h2>
                <p className="mt-2 max-w-[56ch] text-[14px] leading-relaxed text-ink-3">{body}</p>
              </div>
            </article>
          ))}
        </section>
        <section className="mt-16">
          <div className="max-w-[58ch]">
            <p className="edge">In practice</p>
            <h2 className="display mt-4 max-w-[18ch] text-[2rem] leading-[1.02] sm:text-[2.8rem]">
              Made for the way a real company moves.
            </h2>
          </div>
          <div className="mt-10 grid border-l border-t border-edge md:grid-cols-3">
            {(page.inPractice ?? []).map(([title, body], index) => (
              <article key={title} className="border-b border-r border-edge p-6 sm:p-7">
                <span className="font-mono text-[11px] text-ink-4">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3 className="title mt-8 text-[17px]">{title}</h3>
                <p className="mt-3 text-[14px] leading-relaxed text-ink-3">{body}</p>
              </article>
            ))}
          </div>
        </section>
        <div className="mt-12 flex flex-wrap items-center gap-3">
          <Link
            to={session ? '/app' : '/start'}
            className="group inline-flex h-11 items-center gap-2 rounded-sm bg-ink px-5 text-[14px] font-medium text-white transition-colors hover:bg-ink-2"
          >
            {session ? 'Open your panel' : 'Get started'}{' '}
            <ArrowRight className="text-[14px] transition-transform group-hover:translate-x-1" />
          </Link>
          <Link
            to="/"
            className="inline-flex h-11 items-center rounded-sm border border-edge bg-sheet px-5 text-[14px] font-medium text-ink hover:bg-paper"
          >
            Back to overview
          </Link>
        </div>
      </main>
    </div>
  );
}
