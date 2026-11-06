// Arc network config — values from https://docs.arc.io (connect-to-arc, contract-addresses).
//
// Arc gotchas that matter for the frontend (docs: evm-differences):
// - USDC is the native gas token. Native balance = 18 decimals, ERC-20 view = 6 decimals. Never mix them.
// - Mempool silently drops txs with maxFeePerGas < 20 gwei — always set ≥ MIN_MAX_FEE_GWEI.
// - Finality is deterministic and sub-second: one confirmation is final.
// - Order by block number, not timestamp (blocks can share a timestamp).

import { defineChain } from "viem";

export type ArcNetwork = "mainnet" | "testnet";

export const ARC = {
  mainnet: {
    chainId: 5042,
    name: "Arc",
    rpcUrl: "https://rpc.mainnet.arc.io",
    explorer: "https://explorer.arc.io",
    usdc: "0x3600000000000000000000000000000000000000",
    eurc: "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1",
    fxEscrow: "0xe2E5F173576B513d994073CCbDaCBE027d43DFe6",
    gatewayWallet: "0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE",
  },
  testnet: {
    chainId: 5042002,
    name: "Arc Testnet",
    rpcUrl: "https://rpc.testnet.arc.io",
    explorer: "https://explorer.testnet.arc.io",
    usdc: "0x3600000000000000000000000000000000000000",
    eurc: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
    fxEscrow: "0xd68256f4D69C6BbEcB873D8588AE0Dc6B8E22E10",
    gatewayWallet: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
    faucet: "https://faucet.circle.com",
  },
} as const;

export const USDC_ERC20_DECIMALS = 6;
export const NATIVE_DECIMALS = 18;
export const MIN_MAX_FEE_GWEI = 20;

export const network: ArcNetwork = process.env.NEXT_PUBLIC_ARC_NETWORK === "mainnet" ? "mainnet" : "testnet";
export const arc = ARC[network];

/** viem chain definition for the selected Arc network. */
export const arcChain = defineChain({
  id: arc.chainId,
  name: arc.name,
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: NATIVE_DECIMALS },
  rpcUrls: { default: { http: [arc.rpcUrl] } },
  blockExplorers: { default: { name: "Arcscan", url: arc.explorer } },
  testnet: network === "testnet",
});

export const txUrl =(hash: string) => `${arc.explorer}/tx/${hash}`;
export const addressUrl = (addr: string) => `${arc.explorer}/address/${addr}`;

/** EIP-3085 params so an injected wallet can add Arc in one click. */
export function addChainParams() {
  return {
    chainId: `0x${arc.chainId.toString(16)}`,
    chainName: arc.name,
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: NATIVE_DECIMALS },
    rpcUrls: [arc.rpcUrl],
    blockExplorerUrls: [arc.explorer],
  };
}
