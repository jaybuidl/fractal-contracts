//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/IAzoriusVetoGuard.sol";
import "./interfaces/IVetoVoting.sol";
import "./azorius/interfaces/IBaseStrategy.sol";
import "./azorius/interfaces/IAzorius.sol";
import "./TransactionHasher.sol";
import "./FractalBaseGuard.sol";
import "@gnosis.pm/zodiac/contracts/factory/FactoryFriendly.sol";
import "@gnosis.pm/safe-contracts/contracts/common/Enum.sol";

/// @notice A guard contract that prevents transactions that have been vetoed from being executed a Gnosis Safe
/// @notice through an Azorius module with an attached voting strategy
contract AzoriusVetoGuard is
    IAzoriusVetoGuard,
    TransactionHasher,
    FactoryFriendly,
    FractalBaseGuard
{
    IVetoVoting public vetoVoting;
    IBaseStrategy public strategy;
    IAzorius public fractalAzorius;
    uint256 public executionPeriod;
    mapping(uint256 => Proposal) internal proposals;
    mapping(bytes32 => uint256) internal transactionToProposal;

    /// @notice Initialize function, will be triggered when a new proxy is deployed
    /// @param initializeParams Parameters of initialization encoded
    function setUp(bytes memory initializeParams) public override initializer {
        __Ownable_init();
        (
            address _owner,
            address _vetoVoting,
            address _strategy,
            address _fractalAzorius,
            uint256 _exeuctionPeriod
        ) = abi.decode(
                initializeParams,
                (address, address, address, address, uint256)
            );

        transferOwnership(_owner);
        vetoVoting = IVetoVoting(_vetoVoting);
        strategy = IBaseStrategy(_strategy);
        fractalAzorius = IAzorius(_fractalAzorius);
        executionPeriod = _exeuctionPeriod;

        emit AzoriusVetoGuardSetup(
            msg.sender,
            _owner,
            _vetoVoting,
            _strategy,
            _fractalAzorius
        );
    }

    /// @notice Timelocks a transaction for execution
    /// @param proposalId The ID of the proposal to timelock
    function timelockProposal(uint256 proposalId) external {
        // If proposal is not yet timelocked, then finalize the strategy
        if (fractalAzorius.proposalState(proposalId) == IAzorius.ProposalState.ACTIVE)
            strategy.timelockProposal(proposalId);

        require(
            fractalAzorius.proposalState(proposalId) == IAzorius.ProposalState.TIMELOCKED,
            "Proposal timelock failed"
        );

        (uint256 timelockDeadline, , , ) = fractalAzorius.getProposal(proposalId);

        uint256 executionDeadline = timelockDeadline + executionPeriod;

        require(
            block.timestamp > proposals[proposalId].executionDeadline,
            "Proposal has already been timelocked"
        );

        proposals[proposalId].executionDeadline = executionDeadline;
        proposals[proposalId].timelockedBlock = block.number;

        bytes32[] memory txHashes = fractalAzorius.getProposalTxHashes(proposalId);
        for(uint256 i; i < txHashes.length; i++) {
          transactionToProposal[txHashes[i]] = proposalId;
        }

        emit ProposalTimelocked(msg.sender, proposalId);
    }

    function updateExeuctionPeriod(uint256 _executionPeriod)
        external
        onlyOwner
    {
        executionPeriod = _executionPeriod;
    }

    /// @notice This function is called by the Gnosis Safe to check if the transaction should be able to be executed
    /// @notice Reverts if this transaction cannot be executed
    /// @param to Destination address.
    /// @param value Ether value.
    /// @param data Data payload.
    /// @param operation Operation type.
    /// @param safeTxGas Gas that should be used for the safe transaction.
    /// @param baseGas Gas costs for that are independent of the transaction execution(e.g. base transaction fee, signature check, payment of the refund)
    /// @param gasPrice Maximum gas price that should be used for this transaction.
    /// @param gasToken Token address (or 0 if ETH) that is used for the payment.
    /// @param refundReceiver Address of receiver of gas payment (or 0 if tx.origin).
    function checkTransaction(
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address payable refundReceiver,
        bytes memory,
        address
    ) external view override {
        bytes32 txHash = fractalAzorius.getTxHash(to, value, data, operation);

        uint256 proposalId = transactionToProposal[txHash];

        require(
            proposals[proposalId].timelockedBlock > 0,
            "Transaction has not been timelocked yet"
        );

        require(
            block.timestamp <= proposals[proposalId].executionDeadline,
            "Transaction execution period has ended"
        );

        require(!vetoVoting.getIsVetoed(txHash), "Transaction has been vetoed");

        require(!vetoVoting.isFrozen(), "DAO is frozen");
    }

    /// @notice Does checks after transaction is executed on the Gnosis Safe
    /// @param txHash The hash of the transaction that was executed
    /// @param success Boolean indicating whether the Gnosis Safe successfully executed the tx
    function checkAfterExecution(bytes32 txHash, bool success)
        external
        view
        override
    {}

    /// @notice Gets the block number that the transaction was timelocked at
    /// @param _transactionHash The hash of the transaction data
    /// @return uint256 The block number
    function getTransactionTimelockedBlock(bytes32 _transactionHash)
        external
        view
        returns (uint256)
    {
        return proposals[transactionToProposal[_transactionHash]].timelockedBlock;
    }

    /// @notice Gets the block number that the transaction was timelocked at
    /// @param _txHash The hash of the transaction data
    /// @return uint256 The proposal ID the tx is associated with
    function getTransactionProposalId(bytes32 _txHash)
        external
        view
        returns (uint256)
    {
        return transactionToProposal[_txHash];
    }

    /// @notice Gets the block number that the proposal was timelocked at
    /// @param _proposalId The ID of the proposal
    /// @return uint256 The block number the transaction was timelocked at
    function getProposalTimelockedBlock(uint256 _proposalId)
        external
        view
        returns (uint256)
    {
        return proposals[_proposalId].timelockedBlock;
    }

    /// @notice Gets the block number that the proposal was timelocked at
    /// @param _proposalId The ID of the proposal
    /// @return uint256 The timestamp the transaction must be executed by
    function getProposalExecutionDeadline(uint256 _proposalId)
        external
        view
        returns (uint256)
    {
        return proposals[_proposalId].executionDeadline;
    }

    /// @notice Can be used to check if this contract supports the specified interface
    /// @param interfaceId The bytes representing the interfaceId being checked
    /// @return bool True if this contract supports the checked interface
    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(FractalBaseGuard)
        returns (bool)
    {
        return
            interfaceId == type(IAzoriusVetoGuard).interfaceId ||
            super.supportsInterface(interfaceId);
    }
}