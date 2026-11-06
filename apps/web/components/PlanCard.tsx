import { PLANS, PROFIT_SPLIT, TWO_STEP_TARGETS, priceOf, sizeLabel, type Product } from "@tenor/rules";
import { pct, usd } from "@/lib/format";
import { cx } from "./ui";

// One look per plan, so the three cards are told apart at a glance.
const LOOKS = {
  classic: { card: "border-line bg-surface", glow: "", badge: "bg-white/10 text-fg" },
  turbo: { card: "border-accent/40 bg-gradient-to-b from-accent-strong/25 via-surface to-surface", glow: "shadow-[0_20px_60px_-20px_rgb(78_164_255/0.45)]", badge: "bg-accent/20 text-accent" },
  pro: { card: "border-warn/40 bg-gradient-to-b from-warn/20 via-surface to-surface", glow: "shadow-[0_20px_60px_-20px_rgb(245_196_81/0.35)]", badge: "bg-warn/20 text-warn" },
} as const;

export function PlanCard({ product, children, tag }: { product: Product; children: React.ReactNode; tag?: string }) {
  const plan = PLANS[product.plan];
  const look = LOOKS[product.plan];
  const price = priceOf(product);
  const target = product.steps === 2 ? `${pct(TWO_STEP_TARGETS[0])} → ${pct(TWO_STEP_TARGETS[1])}` : pct(plan.profitTarget);

  return (
    <div className={cx("relative flex flex-col rounded-card border p-6", look.card, look.glow)}>
      <div className="flex items-start justify-between gap-3">
        <span className={cx("rounded-full px-2.5 py-1 text-xs font-semibold", look.badge)}>{plan.name}</span>
        {tag && <span className="text-xs text-muted">{tag}</span>}
      </div>
      <div className="mt-4 text-sm text-muted">
        {product.demo ? "Demo" : sizeLabel(product.size)} {product.steps}-Step {plan.name}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="num text-4xl font-medium">{product.demo ? "Free" : usd(price)}</span>
        {!product.demo && <span className="text-sm text-muted">one-time</span>}
      </div>
      <p className="mt-1 text-xs text-faint">{plan.tagline}</p>

      <dl className="mt-5 divide-y divide-line border-y border-line text-sm">
        {[
          ["Account size", `${product.size.toLocaleString()} USDC`],
          [product.steps === 2 ? "Profit targets" : "Profit target", target],
          ["Max drawdown", pct(plan.maxDrawdown)],
          ["Drawdown type", "Static"],
          ["Daily loss limit", pct(plan.dailyLoss)],
          ["Profit split", pct(PROFIT_SPLIT)],
          ["Time limit", "None"],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 py-2.5">
            <dt className="text-muted">{k}</dt>
            <dd className="num text-right">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-5">{children}</div>
    </div>
  );
}
