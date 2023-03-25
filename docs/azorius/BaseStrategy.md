# Solidity API

## BaseStrategy

### AzoriusSet

```solidity
event AzoriusSet(address azoriusModule)
```

### StrategySetUp

```solidity
event StrategySetUp(address azoriusModule, address owner)
```

### OnlyAzorius

```solidity
error OnlyAzorius()
```

### azoriusModule

```solidity
contract IAzorius azoriusModule
```

### onlyAzorius

```solidity
modifier onlyAzorius()
```

Ensures that only the Azorius contract that pertains to this BaseStrategy
can call functions on it.

### setAzorius

```solidity
function setAzorius(address _azoriusModule) external
```

Sets the address of the Azorius contract this BaseStrategy is being used on.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _azoriusModule | address | address of the Azorius Safe module |

### initializeProposal

```solidity
function initializeProposal(bytes _data) external virtual
```

Called by the Azorius module. This notifies this BaseStrategy that a new
Proposal has been created.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _data | bytes | arbitrary data to pass to this BaseStrategy |

### isPassed

```solidity
function isPassed(uint256 _proposalId) external view virtual returns (bool)
```

Returns whether a Proposal has been passed.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _proposalId | uint256 | proposalId to check |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | bool true if the proposal has passed, otherwise false |

### isProposer

```solidity
function isProposer(address _address) external view virtual returns (bool)
```

Returns whether the specified address can submit a Proposal with
this BaseStrategy.

This allows a BaseStrategy to place any limits it would like on
who can create new Proposals, such as requiring a minimum token
delegation.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _address | address | address to check |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | bool true if the address can submit a Proposal, otherwise false |

### votingEndBlock

```solidity
function votingEndBlock(uint256 _proposalId) external view virtual returns (uint256)
```

Returns the block number voting ends on a given Proposal.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _proposalId | uint256 | proposalId to check |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | uint256 block number when voting ends on the Proposal |

### _setAzorius

```solidity
function _setAzorius(address _azoriusModule) internal
```

Sets the address of the Azorius module contract.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _azoriusModule | address | address of the Azorius module |
