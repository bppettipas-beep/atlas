import {
  ArrowLeft,
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
    icon: BookOpen,
  },
} as const;

export function MarketingDetailPage() {
  const { section } = useParams();
  const { session } = useAuth();
  const page = section ? PAGES[section as keyof typeof PAGES] : undefined;

  useEffect(() => window.scrollTo(0, 0), [section]);
  if (!page) return <Navigate to="/" replace />;
  const Icon = page.icon;

  return (
    <div className="min-h-full bg-paper">
      <header className="border-b border-edge bg-paper">
        <div className="mx-auto flex w-full max-w-[960px] items-center justify-between px-5 py-3 sm:px-8">
          <Link to="/" aria-label="Atlas home">
            <Logo markClassName="h-[24px] w-[24px]" wordClassName="text-[15px]" />
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-2 hover:text-ink"
          >
            <ArrowLeft className="text-[13px]" /> Overview
          </Link>
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
