// Checkout guards against the real Arc testnet RPC (no funds moved).
// Run: npm run test:engine (uses a throwaway DB in .data-test/)
import { register } from "node:module";
import assert from "node:assert/strict";
register(new URL("./loader.mjs", import.meta.url));

const { createPublicClient, http } = await import("viem");
const { privateKeyToAccount, generatePrivateKey } = await import("viem/accounts");
const { arc, arcChain } = await import("@/lib/arc");
const { db } = await import("@/lib/server/db");
const C = await import("@/lib/server/checkout");

const ok = (n) => console.log("  ✓", n);
const rejects = async (p, re, n) => {
  await assert.rejects(p, (e) => (re.test(e.message) ? true : (console.log("    got:", e.message), false)));
  ok(n);
};

const client = createPublicClient({ chain: arcChain, transport: http(arc.rpcUrl) });
const chainId = await client.getChainId();
assert.equal(chainId, arc.chainId);
ok(`Arc RPC reachable: chain ${chainId}, block ${await client.getBlockNumber()}`);

const U = "checkout-user";
await db.run("INSERT INTO users (id, email, name, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING", [U, "c@example.com", "C", Date.now()]);
const buyer = privateKeyToAccount(generatePrivateKey());

await rejects(Promise.resolve().then(() => C.createOrder(U, [{ productId: "25000-classic-1", qty: 1 }], buyer.address)), /not configured/, "no treasury → checkout disabled");
process.env.TENOR_TREASURY_ADDRESS = privateKeyToAccount(generatePrivateKey()).address;

await rejects(Promise.resolve().then(() => C.createOrder(U, [{ productId: "demo-classic-1", qty: 1 }], buyer.address)), /unavailable/, "demo can't be bought");
await rejects(Promise.resolve().then(() => C.createOrder(U, [{ productId: "200000-pro-1", qty: 2 }], buyer.address)), /capped/, "$200K active capital cap");
await rejects(Promise.resolve().then(() => C.createOrder(U, [{ productId: "25000-classic-1", qty: 9 }], buyer.address)), /Quantity/, "quantity limit");

const order = await C.createOrder(U, [{ productId: "25000-classic-1", qty: 2 }, { productId: "10000-turbo-2", qty: 1 }], buyer.address);
assert.equal(order.totalMicro, (180 * 2 + 23) * 1e6);
ok(`server prices the cart: ${order.totalMicro / 1e6} USDC (client total never trusted)`);

const stranger = privateKeyToAccount(generatePrivateKey());
const badSig = await stranger.signMessage({ message: order.message });
const fakeTx = "0x" + "ab".repeat(32);
await rejects(C.confirmOrder(U, order.id, fakeTx, badSig), /signature/, "signature from another wallet rejected");

const goodSig = await buyer.signMessage({ message: order.message });
await rejects(C.confirmOrder(U, order.id, fakeTx, goodSig), /not found on Arc/, "unknown tx hash rejected (checked on Arc)");
await rejects(C.confirmOrder("someone-else", order.id, fakeTx, goodSig), /not found/, "other users can't confirm the order");
console.log("\nALL CHECKOUT TESTS PASSED");
