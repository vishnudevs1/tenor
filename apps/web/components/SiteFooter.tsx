import Link from "next/link";
import { Logo } from "./Logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
            Evaluations are simulated. Funded accounts trade real capital owned by Tenor; traders receive a profit share under contract.
          </p>
        </div>
        {[
          { h: "Product", l: [["Challenges", "/#challenges"], ["Transparency", "/transparency"], ["Dashboard", "/dashboard"]] },
          { h: "Built on Arc", l: [["Arc docs", "https://docs.arc.io"], ["Explorer", "https://explorer.testnet.arc.io"], ["Faucet", "https://faucet.circle.com"]] },
          { h: "Legal", l: [["Terms", "#"], ["Privacy", "#"], ["Restricted regions", "#"]] },
        ].map((c) => (
          <div key={c.h}>
            <div className="text-xs font-medium uppercase tracking-[0.14em] text-faint">{c.h}</div>
            <ul className="mt-4 space-y-2.5">
              {c.l.map(([label, href]) => (
                <li key={label}>
                  <Link href={href} className="text-sm text-muted hover:text-fg">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </footer>
  );
}
