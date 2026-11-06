"use client";

import { useState } from "react";
import { ACCOUNT_SIZES, PLAN_KEYS, sizeLabel, type Steps } from "@tenor/rules";
import { PlanCard } from "./PlanCard";
import { Segmented } from "./Segmented";
import { ButtonLink } from "./ui";

// Landing-page version of the shop: same catalog and prices, CTAs go through sign-in.
export function ChallengePicker() {
  const [size, setSize] = useState<number>(25_000);
  const [steps, setSteps] = useState<Steps>(1);

  return (
    <div>
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-4">
        <div className="-mx-4 w-full overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <Segmented label="Account size" value={size} onChange={setSize} options={ACCOUNT_SIZES.map((s) => ({ value: s, label: sizeLabel(s) }))} className="w-full min-w-[420px]" />
        </div>
        <Segmented<Steps> label="Phases" value={steps} onChange={setSteps} options={[{ value: 1, label: "1-Step" }, { value: 2, label: "2-Step" }]} className="w-full max-w-xs" />
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {PLAN_KEYS.map((plan) => (
          <PlanCard key={plan} product={{ size, plan, steps, demo: false }} tag={plan === "turbo" ? "Lowest fee" : plan === "classic" ? "Most popular" : undefined}>
            <ButtonLink href="/challenges" size="lg" className="w-full">Get started</ButtonLink>
          </PlanCard>
        ))}
      </div>

      <p className="mt-6 text-center text-xs text-faint">
        Evaluation accounts are simulated, with fills from a real Arc venue order book. Pay in USDC on Arc. Or{" "}
        <a href="/challenges" className="text-muted underline-offset-2 hover:underline">try a free demo</a>.
      </p>
    </div>
  );
}
