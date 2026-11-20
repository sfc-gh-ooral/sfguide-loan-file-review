'use client';

// Header Live/Sample switch. Live needs a Snowflake connection on the server; without one,
// switching to Live opens setup steps instead (the app never asks for credentials in the browser).
import { Database, FlaskConical, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { HOSTED_EXAMPLE } from '@/lib/hosted';
import { type Mode, preferSample, setPreferredMode } from '@/lib/mode';

const REPO = 'https://github.com/sfc-gh-ooral/sfguide-loan-file-review';

export function ModeChip() {
  const [configured, setConfigured] = useState<boolean>();
  const [mode, setMode] = useState<Mode>();
  const [help, setHelp] = useState(false);

  useEffect(() => {
    const done = (c: boolean) => { setConfigured(c); setMode(c && !preferSample() ? 'live' : 'sample'); };
    if (HOSTED_EXAMPLE) return done(false);
    fetch('/api/mode').then((r) => r.json()).then((j) => done(j.mode === 'live')).catch(() => done(false));
  }, []);
  if (!mode) return null;

  const choose = (next: Mode) => {
    if (next === mode) return;
    if (next === 'live' && !configured) { setHelp(true); return; }
    setPreferredMode(next);
    window.location.reload(); // every screen refetches from the chosen source
  };
  const live = mode === 'live';

  return (
    <>
      <div className="flex items-center h-[34px] rounded-[10px] p-[3px] border" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
        role="radiogroup" aria-label="Environment: data source">
        <button role="radio" aria-checked={!live} onClick={() => choose('sample')} title="Bundled synthetic data; AI answers are captured samples"
          className="h-full px-2.5 rounded-[7px] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
          style={!live ? { background: 'var(--wait-soft)', color: 'var(--wait)' } : { color: 'var(--muted)' }}>
          <FlaskConical className="w-3.5 h-3.5" aria-hidden />Sample
        </button>
        <button role="radio" aria-checked={live} onClick={() => choose('live')}
          title={configured ? 'Data and AI answers from your Snowflake account' : 'Needs a Snowflake connection'}
          className="h-full px-2.5 rounded-[7px] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
          style={live ? { background: 'var(--pass-soft)', color: 'var(--pass)' } : { color: 'var(--muted)' }}>
          {live ? <span className="live-dot" aria-hidden /> : <Database className="w-3.5 h-3.5" aria-hidden />}Live
        </button>
      </div>

      {help && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setHelp(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="live-help-title" className="panel fade-up max-w-lg w-full p-5"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <h2 id="live-help-title" className="text-base font-semibold">Connect Snowflake to use Live mode</h2>
              <button className="btn btn-ghost !px-2" onClick={() => setHelp(false)} aria-label="Close"><X className="w-4 h-4" /></button>
            </div>
            {HOSTED_EXAMPLE ? (
              <p className="text-sm ink-2">This hosted example runs only on synthetic data in your browser. To use Live mode,
                clone the <a className="underline" href={REPO} target="_blank" rel="noreferrer">repository</a> and follow
                &ldquo;Live mode: deploy to your account&rdquo; in the README.</p>
            ) : (
              <>
                <p className="text-sm ink-2 mb-3">No Snowflake connection is configured on this server. For security, the app
                  doesn&apos;t take credentials in the browser. Set them up once on the machine running the app:</p>
                <ol className="text-sm space-y-2 list-decimal pl-5 mb-3">
                  <li>Run <code>sql/setup.sql</code> in a Snowsight worksheet as ACCOUNTADMIN.</li>
                  <li>Create a key pair and register the public key on your user (steps in <code>.env.example</code>).</li>
                  <li>Copy <code>.env.example</code> to <code>.env.local</code> and fill in:</li>
                </ol>
                <pre className="text-xs rounded-lg p-3 mb-3 overflow-x-auto" style={{ background: 'var(--surface-2)' }}>{`SNOWFLAKE_ACCOUNT=<orgname>-<account_name>
SNOWFLAKE_USERNAME=<YOUR_USER>
SNOWFLAKE_PRIVATE_KEY_PATH=/absolute/path/to/loan_review_rsa_key.p8`}</pre>
                <p className="text-sm ink-2">Then restart with <code>npm run dev</code> and switch to Live.{' '}
                  <a className="underline" href={`${REPO}#live-mode-deploy-to-your-account`} target="_blank" rel="noreferrer">Full guide</a></p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
