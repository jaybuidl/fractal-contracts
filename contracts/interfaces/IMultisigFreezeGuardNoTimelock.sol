//SPDX-License-Identifier: MIT
pragma solidity =0.8.19;

import { Enum } from "@gnosis.pm/safe-contracts/contracts/common/Enum.sol";

/**
 * A specification for a Safe Guard contract which allows for multi-sig DAOs (Safes)
 * to operate in a fashion similar to [Azorius](../azorius/Azorius.md) token voting DAOs.
 *
 * An execution period is also required. This is to prevent executing the transaction after
 * a potential freeze period is enacted. Without it a subDAO could just wait for a freeze
 * period to elapse and then execute their desired transaction.
 *
 * See https://docs.safe.global/learn/safe-core/safe-core-protocol/guards.
 */
interface IMultisigFreezeGuardNoTimelock {
    /**
     * Updates the execution period.
     *
     * Execution period is the time period during which a subDAO's passed Proposals must be executed,
     * otherwise they will be expired.
     *
     * This period begins immediately after the timelock period has ended.
     *
     * @param _executionPeriod number of blocks a transaction has to be executed within
     */
    function updateExecutionPeriod(uint32 _executionPeriod) external;
}
