// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Interfaces from blueprint §3.2. Unaudited — do not deploy with real capital.

interface IChallengeRegistry {
    struct Product {
        uint32 id;
        uint256 accountSize;
        uint16 maxDdBps;
        uint16 dailyLossBps;
        uint16 targetBps;
        bytes32 rulesHash;
        bool active;
    }

    function quote(uint32 productId) external view returns (uint256 feeUsdc);
    function purchase(uint32 productId, bytes32 kycRef) external returns (uint256 challengeId);
    function recordResult(uint256 challengeId, bool passed, bytes32 stateRoot, bytes calldata sig) external;
}

interface IPricingEngine {
    function minFee(uint256 size, uint16 maxDdBps) external view returns (uint256);
    function updatePassRate(uint32 productId, uint32 attempts, uint32 passes, bytes32 evidenceRoot) external;
}

interface IRiskReserve {
    function liveMaxLoss() external view returns (uint256);
    function coverageRatio() external view returns (uint256 bps);
    function reserve(uint256 accountId, uint256 maxLoss) external;
    function release(uint256 accountId, uint256 realizedLoss) external;
}

interface IFundedAccountManager {
    struct Limits {
        uint256 capital;
        uint16 maxDdBps;
        uint16 dailyLossBps;
        uint256 maxNotional;
        bytes32 marketsRoot;
        uint8 venue; // 0 edgeX, 1 Extended, 2 Hibachi
        address venueAccount;
    }

    function fund(uint256 challengeId, Limits calldata l) external returns (uint256 accountId);
    function breach(uint256 accountId, bytes32 evidence) external;
    function scaleUp(uint256 accountId, uint256 newCapital) external;
}

interface IPayoutModule {
    function requestPayout(uint256 accountId) external;
    function settle(
        uint256 accountId,
        int256 realizedPnl,
        bytes32 venueProof,
        address payTo,
        address payoutToken
    ) external;
}

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}
