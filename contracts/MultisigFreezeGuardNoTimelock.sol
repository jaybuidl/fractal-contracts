//SPDX-License-Identifier: MIT
pragma solidity =0.8.19;

import { IMultisigFreezeGuardNoTimelock } from "./interfaces/IMultisigFreezeGuardNoTimelock.sol";
import { IBaseFreezeVoting } from "./interfaces/IBaseFreezeVoting.sol";
import { ISafe } from "./interfaces/ISafe.sol";
import { IGuard } from "@gnosis.pm/zodiac/contracts/interfaces/IGuard.sol";
import { FactoryFriendly } from "@gnosis.pm/zodiac/contracts/factory/FactoryFriendly.sol";
import { Enum } from "@gnosis.pm/safe-contracts/contracts/common/Enum.sol";
import { BaseGuard } from "@gnosis.pm/zodiac/contracts/guard/BaseGuard.sol";

/**
 * Implementation of IMultisigFreezeGuardNoTimelock.
 */
contract MultisigFreezeGuardNoTimelock is FactoryFriendly, IGuard, IMultisigFreezeGuardNoTimelock, BaseGuard {

    /** Execution period (in blocks). */
    uint32 public executionPeriod;

    /**
     * Reference to the [IBaseFreezeVoting](./interfaces/IBaseFreezeVoting.md)
     * implementation that determines whether the Safe is frozen.
     */
    IBaseFreezeVoting public freezeVoting;

    /** Reference to the Safe that can be frozen. */
    ISafe public childGnosisSafe;

    event MultisigFreezeGuardSetup(
        address creator,
        address indexed owner,
        address indexed freezeVoting,
        address indexed childGnosisSafe
    );
    event ExecutionPeriodUpdated(uint32 executionPeriod);

    error Expired();
    error DAOFrozen();

    constructor() {
      _disableInitializers();
    }

    /**
     * Initialize function, will be triggered when a new instance is deployed.
     *
     * @param initializeParams encoded initialization parameters: 
     * `uint256 _executionPeriod`, `address _owner`, `address _freezeVoting`, `address _childGnosisSafe`
     */
    function setUp(bytes memory initializeParams) public override initializer {
        __Ownable_init();
        (
            uint32 _executionPeriod,
            address _owner,
            address _freezeVoting,
            address _childGnosisSafe
        ) = abi.decode(
                initializeParams,
                (uint32, address, address, address)
            );

        _updateExecutionPeriod(_executionPeriod);
        transferOwnership(_owner);
        freezeVoting = IBaseFreezeVoting(_freezeVoting);
        childGnosisSafe = ISafe(_childGnosisSafe);

        emit MultisigFreezeGuardSetup(
            msg.sender,
            _owner,
            _freezeVoting,
            _childGnosisSafe
        );
    }

    /** @inheritdoc IMultisigFreezeGuardNoTimelock*/
    function updateExecutionPeriod(uint32 _executionPeriod) external onlyOwner {
        executionPeriod = _executionPeriod;
    }

    /**
     * Called by the Safe to check if the transaction is able to be executed and reverts
     * if the guard conditions are not met.
     */
    function checkTransaction(
        address,
        uint256,
        bytes memory,
        Enum.Operation,
        uint256,
        uint256,
        uint256,
        address,
        address payable,
        bytes memory,
        address
    ) external view override(BaseGuard, IGuard) {
        if (freezeVoting.isFrozen()) revert DAOFrozen();
    }

    /**
     * A callback performed after a transaction is executed on the Safe. This is a required
     * function of the `BaseGuard` and `IGuard` interfaces that we do not make use of.
     */
    function checkAfterExecution(bytes32, bool) external view override(BaseGuard, IGuard) {
        // not implementated
    }

    /** Internal implementation of `updateExecutionPeriod` */
    function _updateExecutionPeriod(uint32 _executionPeriod) internal {
        executionPeriod = _executionPeriod;
        emit ExecutionPeriodUpdated(_executionPeriod);
    }
}
