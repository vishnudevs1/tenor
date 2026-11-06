"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPublicClient, createWalletClient, custom, erc20Abi, formatUnits, http, parseGwei, type Address, type EIP1193Provider, type Hex } from "viem";
import { parseProductId, priceOf, productName } from "@tenor/rules";
import { useCart } from "@/components/cart";
import { Badge, Button, ButtonLink, Card, cx } from "@/components/ui";
import { addChainParams, arc, arcChain, MIN_MAX_FEE_GWEI, txUrl, USDC_ERC20_DECIMALS } from "@/lib/arc";
import { api } from "@/lib/client";
import { shortHash, usd } from "@/lib/format";

type Stage = "review" | "connect" | "order" | "sign" | "pay" | "verify" | "done";
const STAGES: { key: Stage; label: string }[] = [
  { key: "connect", label: "Connect wallet on Arc" },
  { key: "sign", label: "Sign to prove the wallet is yours" },
  { key: "pay", label: "Send USDC" },
  { key: "verify", label: "Verify payment on Arc" },
];

interface Order {
  id: string;
  totalMicro: number;
  treasury: Address;
  wallet: Address;
  message: string;
}
interface Pending {
  orderId: string;
  txHash: Hex;
  signature: Hex;
}

const PENDING_KEY = "tenor.checkout.pending";
const publicClient = createPublicClient({ chain: arcChain, transport: http(arc.rpcUrl) });

function savePending(p: Pending | null) {
  try {
    if (p) localStorage.setItem(PENDING_KEY, JSON.stringify(p));
    else localStorage.removeItem(PENDING_KEY);
  } catch {}
}

/** Confirm with the server; it returns 409 until the RPC node has the receipt. */
async function confirm(p: Pending) {
  for (let i = 0; i < 10; i++) {
    try {
      return await api<{ accountIds: string[] }>("/api/checkout/confirm", { body: p });
    } catch (e) {
      if (i === 9 || !/not found on Arc yet/i.test((e as Error).message)) throw e;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw new Error("Verification timed out");
}

export function CheckoutClient({ configured }: { configured: boolean }) {
  const cart = useCart();
  const [stage, setStage] = useState<Stage>("review");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [resume, setResume] = useState<Pending | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PENDING_KEY);
      if (raw) setResume(JSON.parse(raw) as Pending);
    } catch {}
  }, []);

  const busy = stage !== "review" && stage !== "done";

  async function verify(p: Pending) {
    setStage("verify");
    const { accountIds } = await confirm(p);
    savePending(null);
    setResume(null);
    cart.clear();
    setAccountIds(accountIds);
    setStage("done");
  }

  async function pay() {
    setError(null);
    try {
      const eth = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
      if (!eth) throw new Error("No browser wallet found. Install a wallet such as MetaMask or Rabby to pay with USDC.");

      setStage("connect");
      const wallet = createWalletClient({ chain: arcChain, transport: custom(eth) });
      const [account] = await wallet.requestAddresses();
      try {
        await wallet.switchChain({ id: arcChain.id });
      } catch {
        await eth.request({ method: "wallet_addEthereumChain", params: [addChainParams()] });
      }

      setStage("order");
      const order = await api<Order>("/api/checkout", { body: { lines: cart.lines, wallet: account } });

      const balance = await publicClient.readContract({ address: arc.usdc, abi: erc20Abi, functionName: "balanceOf", args: [account] });
      if (balance < BigInt(order.totalMicro)) {
        throw new Error(
          `This wallet has ${formatUnits(balance, USDC_ERC20_DECIMALS)} USDC on ${arc.name}; the order needs ${formatUnits(BigInt(order.totalMicro), USDC_ERC20_DECIMALS)}.` +
            ("faucet" in arc ? " Get testnet USDC at faucet.circle.com." : ""),
        );
      }

      setStage("sign");
      const signature = await wallet.signMessage({ account, message: order.message });

      setStage("pay");
      // Arc drops transactions priced under 20 gwei without an error, so enforce the floor.
      const floor = parseGwei(String(MIN_MAX_FEE_GWEI));
      const fees = await publicClient.estimateFeesPerGas().catch(() => ({ maxFeePerGas: floor, maxPriorityFeePerGas: 0n }));
      const hash = await wallet.writeContract({
        account,
        address: arc.usdc,
        abi: erc20Abi,
        functionName: "transfer",
        args: [order.treasury, BigInt(order.totalMicro)],
        maxFeePerGas: fees.maxFeePerGas > floor ? fees.maxFeePerGas : floor,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas ?? 0n,
      });
      setTxHash(hash);
      const pending = { orderId: order.id, txHash: hash, signature };
      savePending(pending); // lets the user resume if the tab closes before verification

      await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
      await verify(pending);
    } catch (e) {
      const msg = (e as { shortMessage?: string; message: string }).shortMessage ?? (e as Error).message;
      setError(/rejected|denied/i.test(msg) ? "You cancelled the request in your wallet." : msg);
      setStage("review");
    }
  }

  async function resumeVerification() {
    if (!resume) return;
    setError(null);
    setTxHash(resume.txHash);
    try {
      await verify(resume);
    } catch (e) {
      setError((e as Error).message);
      setStage("review");
    }
  }

  if (stage === "done") {
    return (
      <Card className="mt-8 p-8 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-up/15 text-2xl text-up" aria-hidden>✓</div>
        <h2 className="mt-5 text-xl font-semibold">Payment verified on Arc</h2>
        <p className="mt-2 text-sm text-muted">
          {accountIds.length} evaluation account{accountIds.length === 1 ? "" : "s"} opened: <span className="num text-fg">{accountIds.join(", ")}</span>
        </p>
        {txHash && (
          <a href={txUrl(txHash)} target="_blank" rel="noreferrer" className="num mt-2 inline-block text-xs text-accent">
            {shortHash(txHash)} ↗
          </a>
        )}
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <ButtonLink href={`/trade?account=${accountIds[0]}`}>Start trading</ButtonLink>
          <ButtonLink href="/dashboard" variant="secondary">Go to Home</ButtonLink>
        </div>
      </Card>
    );
  }

  const empty = cart.lines.length === 0;
  return (
    <div className="mt-8 space-y-4">
      {resume && (
        <Card className="flex flex-col gap-3 border-warn/40 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            <div className="font-medium">A payment is waiting for verification</div>
            <div className="num text-xs text-muted">Order {resume.orderId} · {shortHash(resume.txHash)}</div>
          </div>
          <Button variant="secondary" onClick={resumeVerification} disabled={busy}>Verify now</Button>
        </Card>
      )}

      <Card className="divide-y divide-line">
        {empty ? (
          <div className="p-8 text-center text-sm text-muted">
            Your cart is empty. <Link href="/challenges" className="font-medium text-accent">Choose a challenge →</Link>
          </div>
        ) : (
          cart.lines.map((l) => {
            const p = parseProductId(l.productId)!;
            return (
              <div key={l.productId} className="flex items-center justify-between gap-4 px-5 py-4">
                <div>
                  <div className="text-sm font-medium">{productName(p)}</div>
                  <div className="text-xs text-muted">{p.size.toLocaleString()} USDC account · qty {l.qty}</div>
                </div>
                <div className="num text-sm">{usd(priceOf(p) * l.qty, true)}</div>
              </div>
            );
          })
        )}
        <div className="flex items-center justify-between px-5 py-4">
          <span className="font-medium">Total</span>
          <span className="num text-lg font-medium">{usd(cart.subtotal, true)} <span className="text-sm text-muted">USDC</span></span>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Payment</h2>
          <Badge tone="accent">{arc.name}</Badge>
        </div>
        <ol className="mt-4 space-y-3">
          {STAGES.map((s, i) => {
            const order: Stage[] = ["connect", "order", "sign", "pay", "verify"];
            const cur = order.indexOf(stage === "order" ? "connect" : stage);
            const idx = order.indexOf(s.key);
            const state = !busy ? "todo" : idx < cur ? "done" : idx === cur ? "active" : "todo";
            return (
              <li key={s.key} className="flex items-center gap-3 text-sm">
                <span
                  className={cx(
                    "grid size-6 shrink-0 place-items-center rounded-full text-xs",
                    state === "done" ? "bg-up/20 text-up" : state === "active" ? "bg-accent/20 text-accent" : "bg-white/5 text-faint",
                  )}
                >
                  {state === "done" ? "✓" : state === "active" ? <span className="size-2 animate-pulse rounded-full bg-accent" /> : i + 1}
                </span>
                <span className={state === "todo" ? "text-muted" : "text-fg"}>{s.label}</span>
                {s.key === "pay" && txHash && (
                  <a href={txUrl(txHash)} target="_blank" rel="noreferrer" className="num ml-auto text-xs text-accent">{shortHash(txHash)} ↗</a>
                )}
              </li>
            );
          })}
        </ol>

        <Button size="lg" className="mt-6 w-full" onClick={pay} disabled={empty || busy || !configured}>
          {busy ? "Follow the steps in your wallet…" : `Pay ${usd(cart.subtotal, true)} USDC`}
        </Button>
        {!configured && <p className="mt-3 text-center text-xs text-warn">Checkout isn&apos;t configured yet: set TENOR_TREASURY_ADDRESS in apps/web/.env.local.</p>}
        <p role="alert" className="mt-3 min-h-5 text-center text-sm text-down">{error}</p>
        <p className="text-center text-xs text-faint">
          Network fees are paid in USDC and are typically under $0.01. Evaluations are simulated accounts.
        </p>
      </Card>
    </div>
  );
}
