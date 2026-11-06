"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ACCOUNT_SIZES, DEMO_SIZE, MAX_ACTIVE_CAPITAL, PLAN_KEYS, PROFIT_SPLIT, productId, sizeLabel, type Product, type Steps } from "@tenor/rules";
import { useCart } from "@/components/cart";
import { PlanCard } from "@/components/PlanCard";
import { Segmented } from "@/components/Segmented";
import { Button } from "@/components/ui";
import { api } from "@/lib/client";
import { pct, usd } from "@/lib/format";

type SizeChoice = number | "demo";

export function ChallengeShop({ activeCapital }: { activeCapital: number }) {
  const router = useRouter();
  const cart = useCart();
  const [size, setSize] = useState<SizeChoice>(25_000);
  const [steps, setSteps] = useState<Steps>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const demo = size === "demo";
  const used = activeCapital;
  const inCart = cart.capital;
  const pctOf = (n: number) => `${Math.min(100, (n / MAX_ACTIVE_CAPITAL) * 100)}%`;

  async function startDemo() {
    setBusy(true);
    setError(null);
    try {
      const { accountId } = await api<{ accountId: string }>("/api/accounts/demo", { body: { productId: productId({ size: DEMO_SIZE, plan: "classic", steps: 1, demo: true }) } });
      router.push(`/trade?account=${accountId}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      {/* Headline stats */}
      <dl className="mx-auto mt-10 grid max-w-xl grid-cols-3 divide-x divide-line text-center">
        {[
          [usd(MAX_ACTIVE_CAPITAL), "Max active capital"],
          [pct(PROFIT_SPLIT), "Profit split"],
          ["6", "Crypto, gold & FX markets"],
        ].map(([v, k]) => (
          <div key={k} className="px-2">
            <dd className="num text-xl font-semibold sm:text-2xl">{v}</dd>
            <dt className="mt-1 text-xs text-muted">{k}</dt>
          </div>
        ))}
      </dl>

      {/* Active capital meter */}
      <div className="mx-auto mt-10 max-w-xl">
        <div className="flex justify-between text-sm">
          <span className="text-muted">
            Active capital <span className="num text-fg">{usd(used)}</span> / {usd(MAX_ACTIVE_CAPITAL)}
          </span>
          {inCart > 0 && <span className="num text-muted">+{usd(inCart)} in cart</span>}
        </div>
        <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-white/[0.06]">
          <div className="absolute inset-y-0 left-0 rounded-full bg-accent/40" style={{ width: pctOf(used + inCart) }} />
          <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: pctOf(used) }} />
        </div>
      </div>

      {/* Pickers */}
      <div className="mx-auto mt-10 flex max-w-2xl flex-col items-center gap-6">
        <div className="w-full">
          <div className="mb-2 text-center text-sm text-muted">Choose your account size</div>
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <Segmented<SizeChoice>
              label="Account size"
              value={size}
              onChange={setSize}
              options={[{ value: "demo", label: "Demo" }, ...ACCOUNT_SIZES.map((s) => ({ value: s, label: sizeLabel(s) }))]}
              className="w-full min-w-[480px]"
            />
          </div>
        </div>
        {!demo && (
          <div className="w-full max-w-md">
            <div className="mb-2 text-center text-sm text-muted">Choose account phases</div>
            <Segmented<Steps>
              label="Phases"
              value={steps}
              onChange={setSteps}
              options={[{ value: 1, label: "1-Step" }, { value: 2, label: "2-Step" }]}
              className="w-full"
            />
          </div>
        )}
      </div>

      {/* Cards */}
      {demo ? (
        <div className="mx-auto mt-10 max-w-sm">
          <PlanCard product={{ size: DEMO_SIZE, plan: "classic", steps: 1, demo: true }} tag="Practice">
            <Button size="lg" className="w-full" onClick={startDemo} disabled={busy}>
              {busy ? "Opening…" : "Start free demo"}
            </Button>
            <p className="mt-3 text-center text-xs text-faint">Same rules and live prices. Passing a demo doesn't fund an account.</p>
          </PlanCard>
        </div>
      ) : (
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {PLAN_KEYS.map((plan) => {
            const p: Product = { size: size as number, plan, steps, demo: false };
            const over = used + inCart + p.size > MAX_ACTIVE_CAPITAL;
            return (
              <PlanCard key={plan} product={p} tag={plan === "turbo" ? "Lowest fee" : plan === "classic" ? "Most popular" : undefined}>
                <Button size="lg" className="w-full" disabled={over} onClick={() => cart.add(productId(p))}>
                  {over ? "Over capital limit" : "Add to cart"}
                </Button>
              </PlanCard>
            );
          })}
        </div>
      )}
      <p role="alert" className="mt-4 min-h-5 text-center text-sm text-down">{error}</p>
    </>
  );
}
