import Link from "next/link";
import { ChallengePicker } from "@/components/ChallengePicker";
import { ButtonLink, Card, Dot, SectionHeading } from "@/components/ui";
import { CURRENCIES, firm } from "@/lib/data";

const PROMISES = [
  {
    n: "01",
    title: "No B-book. Ever.",
    body: "Every funded trade is a real fill on edgeX, Extended or Hibachi, in an account attributable to you. We never take the other side.",
  },
  {
    n: "02",
    title: "Every loss is pre-funded.",
    body: "A contract on Arc refuses to fund a new trader unless the reserve already covers the max loss of every live account.",
  },
  {
    n: "03",
    title: "We only win when you win.",
    body: "After the evaluation fee, our income is a share of your real profits. Never your losses.",
  },
];

const STEPS = [
  { title: "Pick a challenge", body: "Choose a size and plan. Pay in USDC — from any chain, or by card." },
  { title: "Pass the evaluation", body: "Hit the target on a clearly-labelled simulated account. No time limit." },
  { title: "Trade real capital", body: "Get a funded account on an Arc venue with a trade-only key. Real fills, same rules." },
  { title: "Get paid in seconds", body: "Request a payout any time. 80% to you, in USDC or your local stablecoin." },
];

const FAQ = [
  ["Is the evaluation real trading?", "No. Evaluations are simulated and labelled that way everywhere. Once you pass, your funded account trades real capital owned by Tenor on Arc-native venues."],
  ["How can I verify you don't B-book?", "Every funded account maps to a venue sub-account, and we publish a daily Merkle root of all account states on Arc. The Transparency page shows reserves, liabilities and the coverage ratio live."],
  ["Why does the fee change?", "Fees are set by the PricingEngine contract from our trailing 90-day pass rate, so they always cover the worst case. Your rules are locked at the version you signed up under."],
  ["Which currencies can I be paid in?", "USDC, EURC and local stablecoins on Arc such as BRLA, MXNB, JPYC, KRW1, QCAD and ZARU — converted via Circle StableFX at payout."],
  ["Where is Tenor available?", "Launching in LatAm, Southeast Asia, the Gulf, Africa and the EU. Not available to US or Indian residents for leveraged products at launch."],
];

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="hero-glow relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-4 pb-16 pt-14 text-center sm:px-6 sm:pb-20 sm:pt-20">
          <Link
            href="/challenges"
            className="inline-flex items-center gap-2.5 rounded-full border border-line bg-surface/80 py-1.5 pl-3 pr-4 text-sm text-muted transition-colors hover:border-line-strong hover:text-fg"
          >
            <Dot />
            <span>
              Live prices from <span className="font-medium text-fg">Arc venues</span>
            </span>
            <span className="text-faint">·</span>
            <span className="hidden sm:inline">try a free demo</span>
            <span aria-hidden>→</span>
          </Link>

          <h1 className="mx-auto mt-8 max-w-4xl font-display text-[44px] leading-[1.02] tracking-tight sm:text-7xl md:text-[84px]">
            The prop firm that <em className="pr-[0.12em] text-accent">can't</em> trade against you.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
            Pass a simulated evaluation, then trade real capital on real venues. Every possible loss is pre-funded onchain — and you get paid in your own currency.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <ButtonLink href="#challenges" size="lg" className="w-full sm:w-auto">
              Get funded
            </ButtonLink>
            <ButtonLink href="/transparency" size="lg" variant="secondary" className="w-full sm:w-auto">
              See the reserve
            </ButtonLink>
          </div>

          <dl className="mx-auto mt-14 grid max-w-3xl grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-4">
            {[
              ["A-book share", "100%"],
              ["Profit split", "80%"],
              ["Markets", "Crypto, gold, FX"],
              ["Settlement", "USDC on Arc"],
            ].map(([k, v]) => (
              <div key={k} className="flex flex-col items-center justify-center gap-1.5 bg-surface px-3 py-5">
                <dt className="text-xs text-muted">{k}</dt>
                {/* Sans, not the mono price font: these are words as much as numbers, and must not wrap. */}
                <dd className="whitespace-nowrap text-lg font-semibold tracking-tight tabular-nums sm:text-xl">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Promises */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <SectionHeading eyebrow="Three promises" title="Enforced by code, not marketing." />
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {PROMISES.map((p) => (
            <Card key={p.n} className="flex h-full flex-col p-6">
              <span className="num grid size-9 place-items-center rounded-full bg-accent/10 text-sm font-medium text-accent">{p.n}</span>
              <h3 className="mt-5 text-lg font-semibold tracking-tight">{p.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted">{p.body}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Challenges */}
      <section id="challenges" className="scroll-mt-20 border-y border-line bg-surface/40">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <SectionHeading eyebrow="Challenges" title="Pass once. Get funded. Keep 80%." sub="1-step or 2-step, no time limit, no consistency rule. Prices are set onchain so the firm stays solvent without a B-book." />
          <div className="mt-10">
            <ChallengePicker />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 sm:py-20">
        <SectionHeading eyebrow="How it works" title="Four steps. All on Arc." />
        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex h-full flex-col rounded-card border border-line bg-surface p-6">
              <span className="num grid size-9 place-items-center rounded-full bg-white/5 text-sm font-medium">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="mt-5 text-lg font-semibold tracking-tight">{s.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Local currency */}
      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 sm:pb-20">
        <Card className="overflow-hidden p-6 sm:p-12">
          <div className="grid items-center gap-10 md:grid-cols-2">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-accent">Only on Arc</div>
              <h2 className="mt-3 font-display text-4xl leading-[1.05] sm:text-5xl">Get paid in your own currency.</h2>
              <p className="mt-4 text-[15px] leading-relaxed text-muted">
                Arc hosts local stablecoins in one place. Choose BRLA, MXNB, JPYC and more at payout — converted atomically through Circle StableFX and final in under a second.
              </p>
            </div>
            <ul className="flex flex-wrap gap-2" aria-label="Payout currencies">
              {CURRENCIES.map((c) => (
                <li key={c.code} className="flex items-center gap-2 rounded-full border border-line bg-surface-2 px-3.5 py-2 text-sm">
                  <span className="font-medium">{c.code}</span>
                  <span className="hidden text-muted sm:inline">{c.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </section>

      {/* Venues */}
      <section className="border-y border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-4 py-10 sm:px-6 md:flex-row">
          <p className="text-sm text-muted">Funded trades execute on Arc-native venues</p>
          <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-lg font-semibold tracking-tight text-fg/80">
            {firm.venues.map((v) => (
              <li key={v.name}>{v.name}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-16 sm:px-6 sm:py-20">
        <SectionHeading title="Questions, answered." />
        <div className="mt-10 divide-y divide-line border-y border-line">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group py-5">
              <summary className="flex cursor-pointer items-center justify-between gap-4 text-left font-medium">
                {q}
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white/5 text-muted transition-transform group-open:rotate-45" aria-hidden>
                  +
                </span>
              </summary>
              <p className="mt-3 pr-10 text-[15px] leading-relaxed text-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="hero-glow">
        <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6 sm:py-20">
          <h2 className="font-display text-5xl leading-[1.02] sm:text-6xl">Trade like it's real. Because it is.</h2>
          <ButtonLink href="#challenges" size="lg" className="mt-8">
            Choose a challenge
          </ButtonLink>
        </div>
      </section>
    </>
  );
}
