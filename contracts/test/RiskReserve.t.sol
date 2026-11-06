// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {RiskReserve} from "../src/RiskReserve.sol";
import {PricingEngine} from "../src/PricingEngine.sol";
import {IERC20} from "../src/interfaces/ITenor.sol";

contract MockUSDC {
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 a) external { balanceOf[to] += a; }

    function transfer(address to, uint256 a) external returns (bool) {
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
        return true;
    }

    function transferFrom(address f, address t, uint256 a) external returns (bool) {
        balanceOf[f] -= a;
        balanceOf[t] += a;
        return true;
    }
}

contract RiskReserveTest is Test {
    MockUSDC usdc;
    RiskReserve rr;
    address manager = address(0xFA);

    function setUp() public {
        usdc = new MockUSDC();
        rr = new RiskReserve(IERC20(address(usdc)), manager, 12_000);
    }

    function test_reserveRevertsWithoutCoverage() public {
        usdc.mint(address(rr), 1_000e6);
        vm.prank(manager);
        vm.expectRevert();
        rr.reserve(1, 1_875e6); // needs 2_250e6
    }

    function test_reserveAndRelease() public {
        usdc.mint(address(rr), 2_250e6);
        vm.startPrank(manager);
        rr.reserve(1, 1_875e6);
        assertEq(rr.liveMaxLoss(), 1_875e6);
        rr.release(1, 500e6);
        vm.stopPrank();
        assertEq(rr.liveMaxLoss(), 0);
        assertEq(usdc.balanceOf(manager), 500e6);
    }

    /// Invariant 1 (blueprint §3.2): after every successful reserve, assets ≥ liveMaxLoss × buffer.
    function testFuzz_coverageInvariant(uint96 assets_, uint64[5] memory losses) public {
        usdc.mint(address(rr), assets_);
        vm.startPrank(manager);
        for (uint256 i; i < losses.length; i++) {
            try rr.reserve(i + 1, uint256(losses[i]) + 1) {} catch {}
            assertGe(rr.assets() * 10_000, rr.liveMaxLoss() * rr.bufferBps());
        }
    }

    function test_pricingMatchesBlueprint() public {
        PricingEngine pe = new PricingEngine(address(this));
        // 25K @ 6% DD, 8% pass, 1.25 buffer, 1.2 coverage → $180
        assertEq(pe.minFee(25_000e6, 600), 180e6);
    }
}
