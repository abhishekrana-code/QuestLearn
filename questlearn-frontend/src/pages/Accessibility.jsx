import { Link } from 'react-router-dom';
import { Accessibility as AccessibilityIcon, ArrowLeft } from 'lucide-react';

/**
 * A statement only helps if it is honest about the gaps, so this page lists what is
 * verified and what is not, rather than claiming blanket conformance.
 */
export default function Accessibility() {
  return (
    <div className="shell max-w-3xl py-14 sm:py-20">
      <p className="eyebrow">Accessibility</p>
      <h1 className="page-title mt-3">Using QuestLearn with assistive technology</h1>
      <p className="page-subtitle mt-3">
        QuestLearn aims to meet WCAG 2.2 level AA. This page says what has been checked,
        what has not, and where to report a barrier.
      </p>

      <section className="panel-raised mt-8 p-6 sm:p-8">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <AccessibilityIcon size={17} className="text-gold-text" aria-hidden="true" />
          What is in place
        </h2>
        <ul className="mt-4 space-y-3 text-[13px] leading-6 text-fg-muted">
          <li>
            <strong className="text-foreground">Keyboard only.</strong> Every control is
            reachable with Tab, the focus ring is always visible, and a skip link moves
            focus straight to the page content.
          </li>
          <li>
            <strong className="text-foreground">Contrast.</strong> Body and secondary text
            are held above the 4.5:1 ratio required for normal text, in both the light and
            the dark theme.
          </li>
          <li>
            <strong className="text-foreground">Motion.</strong> Animation is reduced or
            removed when the operating system asks for reduced motion.
          </li>
          <li>
            <strong className="text-foreground">Structure.</strong> Each page has one main
            landmark, a single top-level heading, and named regions for navigation and
            activity feeds.
          </li>
          <li>
            <strong className="text-foreground">Forms.</strong> Every field has a label,
            errors are announced and tied to the field, and a live region reports save and
            submit results.
          </li>
        </ul>
      </section>

      <section className="panel-raised mt-4 p-6 sm:p-8">
        <h2 className="text-base font-semibold text-foreground">Known gaps</h2>
        <ul className="mt-4 space-y-3 text-[13px] leading-6 text-fg-muted">
          <li>
            <strong className="text-foreground">Video has no captions.</strong> A lesson
            video or a recorded learner answer is played as uploaded. Captions are the
            instructor&rsquo;s responsibility and the platform does not generate them.
          </li>
          <li>
            <strong className="text-foreground">Uploaded documents.</strong> A lesson
            attachment is shown as delivered. If a PDF or an image has no text
            alternative, that is a content problem rather than a page problem.
          </li>
          <li>
            <strong className="text-foreground">No third-party audit.</strong> The
            statement reflects the project&rsquo;s own checks: an automated Lighthouse run
            on the landing page, keyboard testing, and the component test suite. It has
            not been reviewed by an external auditor or by a panel of assistive-technology
            users.
          </li>
        </ul>
      </section>

      <section className="panel-raised mt-4 p-6 sm:p-8">
        <h2 className="text-base font-semibold text-foreground">Reporting a barrier</h2>
        <p className="mt-3 text-[13px] leading-6 text-fg-muted">
          Tell your instructor or the administrator of your QuestLearn instance which page
          you were on, what you were trying to do, and which browser and assistive
          technology you use. If the page showed a reference number, include it: that is
          the request id, and it points straight at the server&rsquo;s log line for that
          request.
        </p>
      </section>

      <Link
        to="/"
        className="btn-ghost mt-6 h-10 px-4 text-[12px]"
      >
        <ArrowLeft size={14} />
        Back to the home page
      </Link>
    </div>
  );
}
