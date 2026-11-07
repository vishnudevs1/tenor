import type { Metadata } from "next";
import { treasuryAddress } from "@/lib/server/checkout";
import { CheckoutClient } from "./CheckoutClient";

export const metadata: Metadata = { title: "Checkout | Tenor" };

export default function CheckoutPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Checkout</h1>
      <p className="mt-1 text-sm text-muted">Pay in USDC on Arc. Your evaluation accounts open as soon as the payment is verified on-chain.</p>
      <CheckoutClient configured={treasuryAddress() !== null} />
    </div>
  );
}
