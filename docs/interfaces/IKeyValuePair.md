# Solidity API

## IKeyValuePair

A utility contract to log key/value pair events for the calling address.

### ValueUpdated

```solidity
event ValueUpdated(address theAddress, string key, string value)
```

### updateValue

```solidity
function updateValue(string _key, string _value) external
```

Logs the given key/value pair, along with the caller's address.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _key | string | the key |
| _value | string | the value |
