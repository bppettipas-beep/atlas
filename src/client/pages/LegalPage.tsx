import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft } from '@/components/icons';
import { Logo } from '@/components/Logo';
import { LegalFooter } from '@/components/marketing/LegalFooter';

type Section = { heading: string; copy: string[]; items?: string[] };

const PAGES: Record<string, { title: string; intro: string; sections: Section[] }> = {
  privacy: {
    title: 'Privacy Policy',
    intro: 'How Atlas handles personal information when people use the service.',
    sections: [
      { heading: 'Information we handle', copy: ['Atlas processes account information such as names, email addresses, profile information, company roles, and authentication information. Companies may also add work, schedules, documents, chat messages, and other operational information to their Atlas workspace.'] },
      { heading: 'How information is used', copy: ['We use information to provide and secure Atlas, authenticate users, operate company workspaces, send service notices, respond to support requests, and improve reliability. We do not sell personal information.'] },
      { heading: 'Company workspace information', copy: ['The company that creates an Atlas workspace decides what work and employee information is entered there. That company is responsible for having a lawful basis to share that information and for setting access rules inside its workspace.'] },
      { heading: 'Sharing and access', copy: ['Information is visible to people in the same workspace according to their assigned role and permissions. We may use service providers to host, secure, and operate Atlas, only as needed to provide the service. We may disclose information when required by law or to protect the security, rights, and safety of Atlas, its users, or others.'] },
      { heading: 'Retention and security', copy: ['We retain information while an account or workspace remains active and as needed for legitimate business, legal, security, and backup purposes. Atlas uses reasonable administrative, technical, and organizational safeguards, but no online service can guarantee absolute security.'] },
      { heading: 'Your choices', copy: ['You can update information in account settings. For information controlled by your company, contact your company administrator first. You may also have privacy rights under applicable law, including rights to access, correct, delete, or receive a copy of personal information.'] },
      { heading: 'Changes and contact', copy: ['We may update this policy as Atlas evolves. A revised effective date will appear on this page. For privacy questions, contact your Atlas workspace administrator or the Atlas support contact provided in the product.'] },
    ],
  },
  terms: {
    title: 'Terms of Service',
    intro: 'The rules for using Atlas and operating an Atlas company workspace.',
    sections: [
      { heading: 'Using Atlas', copy: ['By creating an account, joining a workspace, or using Atlas, you agree to these terms. If you use Atlas for a company, you confirm that you are authorized to accept these terms for that company.'] },
      { heading: 'Accounts and access', copy: ['Keep sign-in credentials confidential and provide accurate account information. You are responsible for activity carried out through your account and for promptly reporting suspected unauthorized access. Workspace owners are responsible for assigning roles, inviting members, and managing their company workspace.'] },
      { heading: 'Acceptable use', copy: ['Use Atlas only in a lawful, respectful, and secure manner. Do not attempt to bypass permissions, access another company’s information, interfere with the service, upload malicious material, infringe someone else’s rights, or use Atlas to harass, defraud, or harm others.'], items: ['Do not share accounts or impersonate another person.', 'Do not probe, scan, or test the service without written permission.', 'Do not use Atlas to store content that is unlawful or violates applicable privacy or employment laws.'] },
      { heading: 'Your content', copy: ['You keep ownership of the content your company puts into Atlas. You grant Atlas the limited rights needed to host, process, display, and back up that content to operate the service. You are responsible for ensuring your content and your use of it comply with law and these terms.'] },
      { heading: 'Subscriptions and payment', copy: ['Paid plans are billed on the schedule shown at purchase or in your workspace. You are responsible for applicable taxes and for keeping billing information current. Plan features and employee limits are described on the pricing page and may change when you upgrade, downgrade, or cancel.'] },
      { heading: 'Availability and termination', copy: ['We work to keep Atlas reliable, but the service may occasionally be interrupted for maintenance, security, or factors beyond our control. You may stop using Atlas at any time. We may suspend or terminate access when needed to protect the service, comply with law, or address a material breach of these terms.'] },
      { heading: 'Disclaimers and liability', copy: ['Atlas is provided on an “as is” and “as available” basis to the extent permitted by law. To the maximum extent permitted by law, Atlas is not liable for indirect, incidental, special, consequential, or punitive damages, or for lost profits, data, or business opportunities arising from use of the service.'] },
      { heading: 'Changes and contact', copy: ['We may update these terms from time to time. Continuing to use Atlas after an update takes effect means you accept the revised terms. Questions should be directed to the Atlas support contact provided in the product.'] },
    ],
  },
  cookies: {
    title: 'Cookie Policy',
    intro: 'How Atlas uses browser storage to keep the service working and secure.',
    sections: [
      { heading: 'What cookies are', copy: ['Cookies and similar technologies are small pieces of information stored in a browser. Atlas may also use local storage or session storage for similar purposes.'] },
      { heading: 'How Atlas uses them', copy: ['Atlas uses essential browser storage to keep you signed in, maintain session security, remember basic interface preferences, and help prevent abuse. These are necessary for the service to function.'] },
      { heading: 'Analytics and third parties', copy: ['If Atlas introduces optional analytics or marketing technologies, we will describe them here and provide any notice or choice required by applicable law. We do not use browser storage to sell personal information.'] },
      { heading: 'Your controls', copy: ['Most browsers let you block or delete cookies. Blocking essential cookies may prevent sign-in or other Atlas features from working correctly. For company-managed devices, your company may also control browser settings.'] },
      { heading: 'Updates and questions', copy: ['We may update this policy when our technology changes. For questions, contact your Atlas workspace administrator or the Atlas support contact provided in the product.'] },
    ],
  },
};

export function LegalPage() {
  const { document } = useParams();
  const page = document ? PAGES[document] : undefined;
  if (!page) return <Navigate to="/" replace />;

  return (
    <div className="min-h-full bg-paper">
      <header className="border-b border-edge bg-sheet">
        <div className="mx-auto flex h-14 w-full max-w-[960px] items-center justify-between px-5 sm:px-8">
          <Link to="/" aria-label="Atlas home"><Logo markClassName="h-[24px] w-[24px]" wordClassName="text-[15px]" /></Link>
          <Link to="/" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-2 transition-colors hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" />Back to Atlas</Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[960px] px-5 py-14 sm:px-8 sm:py-20">
        <div className="max-w-[720px]">
          <p className="edge">Legal</p>
          <h1 className="display mt-4 text-[2.6rem] leading-[0.98] sm:text-[4rem]">{page.title}</h1>
          <p className="mt-5 text-[16px] leading-relaxed text-ink-2">{page.intro}</p>
          <p className="mt-5 border-y border-edge py-3 font-mono text-[11px] text-ink-3">Effective July 29, 2026</p>
        </div>
        <div className="mt-12 max-w-[760px] space-y-10">
          {page.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="title text-[20px]">{section.heading}</h2>
              {section.copy.map((paragraph) => <p key={paragraph} className="mt-3 text-[14px] leading-relaxed text-ink-2">{paragraph}</p>)}
              {section.items && <ul className="mt-4 list-disc space-y-2 pl-5 text-[14px] leading-relaxed text-ink-2">{section.items.map((item) => <li key={item}>{item}</li>)}</ul>}
            </section>
          ))}
        </div>
        <LegalFooter />
      </main>
    </div>
  );
}
