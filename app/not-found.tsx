import React from 'react';
import Link from 'next/link';

export const metadata = {
  title: '404: Page Not Found — Make-A-Ton 9.0',
  description: 'Looks like this page got lost in the multiverse. Head back to Make-A-Ton 9.0.',
  robots: {
    index: false,
    follow: true,
  },
};

export default function NotFound() {
  return (
    <main className="section section--error pattern pattern--squiggle">
      <div className="tape tape--strike" data-tape="ERROR 404 · PAGE NOT FOUND · CHAPTER MISSING"></div>
      <div className="section__inner">
        <article className="card card--white error-card">
          <div className="error-content">
            <h1 className="error-title">Lost in the Multiverse!</h1>
            <p className="error-lead">Oops! This panel never got drawn.</p>
            <p className="error-text">
              This page slipped into another dimension. Let&apos;s get you back to the build!
            </p>

            <div className="error-actions">
              <Link href="/" className="btn btn--big btn--home">
                Back to Home
              </Link>
            </div>

            <div className="error-socials">
              <span className="error-socials__label">Follow along:</span>
              <ul className="error-socials__list">
                <li><a className="error-socials__link" href="/insta" target="_blank" rel="noopener noreferrer" aria-label="Instagram">IG</a></li>
                <li><a className="error-socials__link" href="/linkedin" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">IN</a></li>
                <li><a className="error-socials__link" href="/discord" target="_blank" rel="noopener noreferrer" aria-label="Discord">DC</a></li>
                <li><a className="error-socials__link" href="/telegram" target="_blank" rel="noopener noreferrer" aria-label="Telegram">TG</a></li>
                <li><a className="error-socials__link" href="/x" target="_blank" rel="noopener noreferrer" aria-label="X">X</a></li>
                <li><a className="error-socials__link" href="/wa" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp">WA</a></li>
              </ul>
            </div>
          </div>

          <div className="error-visual" aria-hidden="true">
            <div className="error-bubble">Wrong Timeline?</div>
            <img
              className="error-mascot"
              src="/assets/mascot/mascot-green-curious.svg"
              alt=""
              width={242}
              height={325}
            />
          </div>
        </article>
      </div>
      <div className="tape tape--strike-bottom" data-tape="ERROR 404 · PAGE NOT FOUND · CHAPTER MISSING" data-reverse></div>
    </main>
  );
}
