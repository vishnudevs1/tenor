// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IRiskReserve, IERC20} from "./interfaces/ITenor.sol";

/// @notice Promise 2 — every loss is pre-funded.
/// `reserve()` reverts unless USDC held ≥ Σ live max loss × buffer.
/// v0: plain vault. ERC-4626 first-loss shares land in Phase 0b (needs OpenZeppelin).
contract RiskReserve is IRiskReserve {
    uint256 public constant BPS = 10_000;

    IERC20 public immutable usdc;
    address public immutable manager; // FundedAccountManager
    uint256 public immutable bufferBps; // e.g. 12_000 = 1.2× target coverage

    uint256 public override liveMaxLoss;
    mapping(uint256 accountId => uint256) public reservedOf;

    error NotManager();
    error InsufficientCoverage(uint256 assets, uint256 required);
    error AlreadyReserved(uint256 accountId);
    error NotReserved(uint256 accountId);

    event Reserved(uint256 indexed accountId, uint256 maxLoss, uint256 coverageBps);
    event Released(uint256 indexed accountId, uint256 realizedLoss);

    constructor(IERC20 usdc_, address manager_, uint256 bufferBps_) {
        usdc = usdc_;
        manager = manager_;
        bufferBps = bufferBps_;
    }

    modifier onlyManager() {
        if (msg.sender != manager) revert NotManager();
        _;
    }

    function assets() public view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    /// @return bps assets / (liveMaxLoss × buffer); type(uint256).max when nothing is live.
    function coverageRatio() public view override returns (uint256 bps) {
        if (liveMaxLoss == 0) return type(uint256).max;
        return (assets() * BPS * BPS) / (liveMaxLoss * bufferBps);
    }

    function reserve(uint256 accountId, uint256 maxLoss) external override onlyManager {
        if (reservedOf[accountId] != 0) revert AlreadyReserved(accountId);
        uint256 next = liveMaxLoss + maxLoss;
        uint256 required = (next * bufferBps) / BPS;
        if (assets() < required) revert InsufficientCoverage(assets(), required);
        reservedOf[accountId] = maxLoss;
        liveMaxLoss = next;
        emit Reserved(accountId, maxLoss, coverageRatio());
    }

    /// @dev Realized loss is paid to the manager (to settle on the venue); unused reservation is freed.
    function release(uint256 accountId, uint256 realizedLoss) external override onlyManager {
        uint256 r = reservedOf[accountId];
        if (r == 0) revert NotReserved(accountId);
        delete reservedOf[accountId];
        liveMaxLoss -= r;
        uint256 paid = realizedLoss > r ? r : realizedLoss;
        if (paid > 0) usdc.transfer(manager, paid);
        emit Released(accountId, paid);
    }
}
