# Delta Net Protocol v0.1

Delta Net is a real-time networking protocol designed for presence-based multiplayer games. It focuses on efficiently synchronizing game state between clients and server using delta encoding and varint encoding.

## Core Concepts

### Components
- Numeric values that change frequently (e.g., position coordinates)
- Each component has a unique ID
- Values are transmitted using delta compression (changes from previous state)
- Components are updated at regular intervals (ticks)
- Component values are stored as `bigint` for high precision

### States
- Binary values that change infrequently (e.g., usernames, serialized objects)
- Each state has a unique ID
- Transmitted only when they change
- Not included in regular tick updates
- Values are transmitted as Uint8Arrays for maximum flexibility

### User Indices
- Each user is assigned a unique index in the server's data array
- This index is used to track all user data
- Indices can be removed when users disconnect
- Client must defragment indices when removals occur

## Message Types

### Server to Client Messages

#### 1. Initial Checkout (Type 1)
Sent when a client first connects to establish initial state.

```typescript
{
  type: "initialCheckout";
  serverTime: number;        // Current server time
  indicesCount: number;      // Number of user indices
  components: Array<{
    componentId: number;     // ID of the component
    deltas: BigInt64Array;   // Delta values from the tick
    values: BigInt64Array;   // Initial values for all users
  }>;
  states: Array<{
    stateId: number;         // ID of the state
    values: Array<Uint8Array>; // Initial state values for all users
  }>;
}
```

#### 2. Server Custom (Type 2)
Custom server messages with application-specific content.

```typescript
{
  type: "serverCustom";
  customType: number;        // Application-defined custom message type
  contents: string;          // Custom message content
}
```

#### 3. User Index (Type 3)
Response to client connection, assigns an index to the user/connection.

```typescript
{
  type: "userIndex";
  index: number;             // Assigned user index
}
```

#### 4. Tick (Type 4)
Regular state updates sent at configurable intervals (typically 5-20Hz).

```typescript
{
  type: "tick";
  serverTime: number;        // Current server time
  removedIndices: number[];  // Indices of disconnected users
  indicesCount: number;      // Current number of indices
  componentDeltaDeltas: Array<{
    componentId: number;
    componentDeltaDeltaBytes: Uint8Array; // Second-order deltas
  }>;
  states: Array<{
    stateId: number;
    updatedStates: Array<[number, Uint8Array]>; // [index, value] pairs
  }>;
}
```

#### 5. Ping (Type 5)
Server heartbeat message to check client connectivity.

```typescript
{
  type: "ping";
  ping: number;              // Ping identifier
}
```

#### 6. Warning (Type 6)
Server warning messages for non-critical issues.

```typescript
{
  type: "warning";
  message: string;           // Warning message
}
```

#### 7. Error (Type 7)
Server error messages for critical issues.

```typescript
{
  type: "error";
  errorType: string;         // Error type identifier
  message: string;           // Error message
  retryable: boolean;        // Whether the client should retry
}
```

### Client to Server Messages

#### 1. Connect User (Type 64)
Initial connection request from client.

```typescript
{
  type: "connectUser";
  token: string;             // Authentication token
  observer: boolean;         // Whether client is observer-only
  components: Array<[number, bigint]>; // [componentId, value] pairs
  states: Array<[number, Uint8Array]>; // [stateId, value] pairs
}
```

#### 2. Client Custom (Type 65)
Custom client messages with application-specific content.

```typescript
{
  type: "clientCustom";
  customType: number;        // Application-defined custom message type
  contents: string;          // Custom message content
}
```

#### 3. Set User Components (Type 66)
Client updates to component and state values.

```typescript
{
  type: "setUserComponents";
  components: Array<[number, bigint]>; // [componentId, value] pairs
  states: Array<[number, Uint8Array]>; // [stateId, value] pairs
}
```

#### 4. Pong (Type 68)
Response to server ping messages.

```typescript
{
  type: "pong";
  pong: number;              // Pong identifier (matches ping)
}
```

## Data Encoding

### Varint Encoding
- Uses standard varint encoding for all numeric values
- Efficient for small numbers
- Variable length based on value size

### BigInt Components
- Component values are stored as `bigint` for high precision
- Allows for precise representation of large numeric values
- Uses varint encoding for efficient transmission

### Delta Compression
- Components use double delta compression:
  1. First delta: difference from previous value
  2. Second delta: difference from previous delta
- This provides better compression for values that change predictably
- Uses deflate compression for component arrays

### Message Format
Each message starts with a type byte, followed by:
- Length-prefixed fields using varints
- Binary data for components (compressed)
- Length-prefixed binary data for states

## Protocol Flow

1. **Connection**
   - Client sends Connect User message with initial state
   - Server responds with User Index message
   - Server sends Initial Checkout message with full game state

2. **Regular Updates**
   - Server sends Tick messages at regular intervals
   - Clients can send Set User Components messages with updates
   - Server broadcasts changes to all clients

3. **Custom Messages**
   - Server and clients can send custom messages for application-specific communication
   - Custom messages include a `customType` field for application routing

4. **Connection Maintenance**
   - Server sends Ping messages
   - Clients respond with Pong messages
   - Server can send Warning or Error messages as needed

## Implementation Notes

- All numeric values use varint encoding for efficiency
- Component values are stored as `bigint` for precision
- Component updates use double delta compression with deflate for better compression
- State updates are sent only when they change
- Clients must handle index defragmentation when users disconnect
- The protocol supports both regular users and observer-only clients
- Custom messages allow for application-specific extensions to the protocol
- Error messages include a `retryable` flag to indicate whether clients should attempt reconnection
