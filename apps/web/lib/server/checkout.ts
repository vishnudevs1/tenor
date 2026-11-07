import "server-only";
import { createPublicClient, erc20Abi, getAddress, http, isAddress, isHash, parseEventLogs, verifyMessage, type Hex } from "viem";
import { MAX_ACTIVE_CAPITAL, parseProductId, priceOf, productName } from "@tenor/rules";
import { arc, arcChain, USDC_ERC20_DECIMALS } from "@/lib/arc";
import { db, isUniqueViolation, newId, tx } from "./db";
import { insertAccount, TradeError } from "./engine";

// Checkout = a USDC transfer on Arc to the Tenor treasury, verified on-chain by the server.
// Wallet ownership is proven by a signed message, so nobody can claim someone else's payment.

const ORDER_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_LINES = 10;
const MAX_QTY = 5;

/** Raw env value, tolerant of the usual copy-paste noise: whitespace, quotes, and any letter case. */
function treasuryRaw() {
  return (process.env.TENOR_TREASURY_ADDRESS ?? "").trim().replace(/^["']|["']$/g, "").trim();
}

export function treasuryAddress(): `0x${string}` | null {
  // Lower-casing skips the EIP-55 checksum test (a mistyped mixed-case address would otherwise be rejected);
  // getAddress then returns the canonical checksummed form.
  const t = treasuryRaw().toLowerCase();
  return isAddress(t) ? getAddress(t) : null;
}

/** For /api/health: distinguishes "not set" from "set but not an address". */
export function treasuryStatus(): "ok" | "missing" | "invalid" {
  if (!treasuryRaw()) return "missing";
  return treasuryAddress() ? "ok" : "invalid";
}

const client = createPublicClient({ chain: arcChain, transport: http(arc.rpcUrl) });

interface OrderRow {
  id: string;
  user_id: string;
  items_json: string;
  total_micro: number;
  wallet: string;
  status: "pending" | "paid" | "expired";
  tx_hash: string | null;
  created_at: number;
}

export interface CartLine {
  productId: string;
  qty: number;
}

export function orderMessage(o: { id: string; total_micro: number; wallet: string }) {
  return `Tenor checkout\nOrder: ${o.id}\nTotal: ${(o.total_micro / 10 ** USDC_ERC20_DECIMALS).toFixed(2)} USDC\nWallet: ${o.wallet}`;
}

export async function activeCapital(userId: string) {
  const r = await db.one<{ s: number }>("SELECT COALESCE(SUM(size), 0) AS s FROM accounts WHERE user_id = $1 AND demo = 0 AND status = 'active'", [userId]);
  return Number(r?.s ?? 0);
}

/** Prices the cart server-side (client totals are never trusted) and opens a pending order. */
export async function createOrder(userId: string, lines: CartLine[], wallet: string) {
  const treasury = treasuryAddress();
  if (!treasury) throw new TradeError("Checkout is not configured yet (treasury address missing)", 503);
  if (!isAddress(wallet)) throw new TradeError("Invalid wallet address");
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > MAX_LINES) throw new TradeError("Your cart is empty");

  let totalMicro = 0;
  let capital = 0;
  const items = lines.map((l) => {
    const p = parseProductId(String(l.productId));
    const qty = Number(l.qty);
    if (!p || p.demo) throw new TradeError("Your cart contains an unavailable challenge");
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) throw new TradeError(`Quantity must be between 1 and ${MAX_QTY}`);
    const unitPrice = priceOf(p);
    totalMicro += unitPrice * 10 ** USDC_ERC20_DECIMALS * qty;
    capital += p.size * qty;
    return { productId: l.productId, qty, unitPrice, name: productName(p) };
  });

  const used = await activeCapital(userId);
  if (used + capital > MAX_ACTIVE_CAPITAL) {
    throw new TradeError(`Active capital is capped at $${MAX_ACTIVE_CAPITAL.toLocaleString()}. You have $${used.toLocaleString()} active`);
  }

  const id = newId("OR");
  const addr = getAddress(wallet);
  await db.run("INSERT INTO orders (id, user_id, items_json, total_micro, wallet, status, created_at) VALUES ($1, $2, $3, $4, $5, 'pending', $6)", [
    id,
    userId,
    JSON.stringify(items),
    totalMicro,
    addr,
    Date.now(),
  ]);
  return { id, items, totalMicro, treasury, wallet: addr, message: orderMessage({ id, total_micro: totalMicro, wallet: addr }) };
}

/** Verify the signed message + the USDC transfer on Arc, then open the evaluation accounts. Idempotent. */
export async function confirmOrder(userId: string, orderId: string, txHash: string, signature: string) {
  const order = await db.one<OrderRow>("SELECT * FROM orders WHERE id = $1", [orderId]);
  if (!order || order.user_id !== userId) throw new TradeError("Order not found", 404);
  if (order.status === "paid") return { accountIds: (await db.all<{ id: string }>("SELECT id FROM accounts WHERE order_id = $1 ORDER BY created_at", [orderId])).map((r) => r.id) };
  if (Date.now() - order.created_at > ORDER_TTL_MS) throw new TradeError("This order expired. Please check out again.", 410);
  if (!isHash(txHash)) throw new TradeError("Invalid transaction hash");
  if (await db.one("SELECT id FROM orders WHERE tx_hash = $1", [txHash])) throw new TradeError("This transaction was already used", 409);

  const wallet = getAddress(order.wallet);
  const signed = await verifyMessage({ address: wallet, message: orderMessage(order), signature: signature as Hex }).catch(() => false);
  if (!signed) throw new TradeError("Wallet signature doesn't match this order", 401);

  const receipt = await client.getTransactionReceipt({ hash: txHash as Hex }).catch(() => null);
  if (!receipt) throw new TradeError("Transaction not found on Arc yet. Retrying…", 409);
  if (receipt.status !== "success") throw new TradeError("The payment transaction failed on Arc");

  const treasury = treasuryAddress()!;
  const paid = parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: receipt.logs })
    .filter((l) => l.address.toLowerCase() === arc.usdc.toLowerCase() && getAddress(l.args.from) === wallet && getAddress(l.args.to) === treasury)
    .reduce((sum, l) => sum + l.args.value, 0n);
  if (paid < BigInt(order.total_micro)) throw new TradeError("Payment amount is lower than the order total");

  // A payment made before this order existed can't be reused for it.
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  if (Number(block.timestamp) * 1000 < order.created_at - 60_000) throw new TradeError("This payment predates the order");

  const items = JSON.parse(order.items_json) as { productId: string; qty: number }[];
  try {
    const accountIds = await tx(async (t) => {
      const updated = await t.run("UPDATE orders SET status = 'paid', tx_hash = $1, paid_at = $2 WHERE id = $3 AND status = 'pending'", [txHash, Date.now(), orderId]);
      if (updated === 0) throw new TradeError("Order already processed", 409);
      const ids: string[] = [];
      for (const i of items) for (let n = 0; n < i.qty; n++) ids.push(await insertAccount(t, userId, i.productId, orderId));
      return ids;
    });
    return { accountIds };
  } catch (e) {
    // Two orders racing to claim the same payment: the UNIQUE(tx_hash) constraint picks one.
    if (isUniqueViolation(e)) throw new TradeError("This transaction was already used", 409);
    throw e;
  }
}
