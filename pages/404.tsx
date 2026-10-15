import React from 'react';
import Head from 'next/head';
import Link from 'next/link';

export default function Custom404() {
  return (
    <>
      <Head>
        <title>404: Page Not Found &mdash; Make-A-Ton 9.0</title>
        <meta name="description" content="Looks like this page got lost in the multiverse. Head back to Make-A-Ton 9.0." />
        <meta name="robots" content="noindex, follow" />
      </Head>

      <main className="section section--error pattern pattern--squiggle">
        <div className="tape tape--divider" data-tape="ERROR 404 · PAGE NOT FOUND · CHAPTER MISSING"></div>
        <div className="section__inner">
          <article className="card card--white error-card">
            <div className="error-content">
              <span className="error-badge">Chapter 404</span>
              <h1 className="error-title">Lost in the Multiverse!</h1>
              <p className="error-lead">Oops! This panel never got drawn.</p>
              <p className="error-text">
                Looks like this page slipped into another dimension, got eaten by a compile error, or was lost in a merge conflict.
                Don&apos;t worry builder&mdash;the main arena is still open and shipping non-stop!
              </p>

              <div className="error-actions">
                <Link href="/" className="btn btn--big btn--home">
                  Back to Home
                </Link>
                <Link href="/#timeline" className="btn">
                  View Timeline
                </Link>
              </div>

              <div className="error-links">
                <span>Quick jumps:</span>
                <Link href="/#about">About</Link>
                <Link href="/#odoo">Odoo</Link>
                <Link href="/#prizes">Prizes</Link>
                <Link href="/#faq">FAQ</Link>
                <a href="/wa" target="_blank" rel="noopener noreferrer">WhatsApp Group</a>
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
      </main>
    </>
  );
}
