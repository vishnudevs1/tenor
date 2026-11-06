// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPricingEngine} from "./interfaces/ITenor.sol";

/// @notice Self-pricing challenges (blueprint §4.2).
/// minFee = passRate × size × maxDd × gapBuffer × targetCoverage
/// Mirrors packages/rules/src/pricing.ts — keep both in sync.
contract PricingEngine is IPricingEngine {
    uint256 public constant BPS = 10_000;

    address public immutable attestor;
    uint256 public gapBufferBps = 12_500; // 1.25×
    uint256 public targetCoverageBps = 12_000; // 1.2×

    /// Trailing pass rate in bps; one global rate in v0, per-product later.
    uint256 public passRateBps = 800; // 8% until real data arrives
    bytes32 public lastEvidenceRoot;

    error NotAttestor();
    event PassRateUpdated(uint32 indexed productId, uint256 passRateBps, bytes32 evidenceRoot);

    constructor(address attestor_) {
        attestor = attestor_;
    }

    function minFee(uint256 size, uint16 maxDdBps) public view override returns (uint256) {
        // Round up: rounding down would put the fee under the solvency line.
        uint256 num = size * passRateBps * maxDdBps * gapBufferBps * targetCoverageBps;
        uint256 den = BPS ** 4;
        return (num + den - 1) / den;
    }

    function updatePassRate(uint32 productId, uint32 attempts, uint32 passes, bytes32 evidenceRoot)
        external
        override
    {
        if (msg.sender != attestor) revert NotAttestor();
        require(attempts > 0 && passes <= attempts, "bad sample");
        passRateBps = (uint256(passes) * BPS) / attempts;
        lastEvidenceRoot = evidenceRoot;
        emit PassRateUpdated(productId, passRateBps, evidenceRoot);
    }
}
