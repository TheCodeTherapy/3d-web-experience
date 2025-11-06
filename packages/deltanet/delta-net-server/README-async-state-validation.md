# Async State Validation and Connection Management

The `DeltaNetServer` now supports both synchronous and asynchronous state validation and connection handling. Each connection manages its own lifecycle completely, including getting a connection ID immediately upon creation and handling all joining logic internally.

## Features

- **Immediate Connection IDs**: Connections receive their ID immediately when created, before any messages
- **Self-Managed Connection Lifecycle**: Each connection handles its own joining process internally
- **Async State Validation**: The `onStatesUpdate` callback can return a `Promise`
- **Async Connection Handling**: The `onJoiner` callback can now return a `Promise` and receives the actual connection ID
- **Independent State Processing**: Each state is validated independently within each connection
- **Connection-Level State Management**: Pending state and validation tracking is handled at the connection level
- **Automatic Cancellation**: Pending validations are cancelled when superseded or when connections close
- **Backward Compatibility**: Existing synchronous callbacks continue to work exactly as before

## Type Signatures

### New Joiner Callback
```typescript
onJoiner?: (opts: onJoinerOptions) => 
  | true 
  | void 
  | Error 
  | DeltaNetServerError 
  | Promise<true | void | Error | DeltaNetServerError>;

type onJoinerOptions = {
  deltaNetV01Connection: DeltaNetV01Connection;
  components: Array<[number, bigint]>;
  states: Array<[number, Uint8Array]>;
  token: string;
  internalConnectionId: number; // This is the actual ID the connection already has
};
```

### State Update Callback
```typescript
onStatesUpdate?: (opts: onStatesUpdateOptions) => 
  | true 
  | void 
  | Error 
  | DeltaNetServerError 
  | Promise<true | void | Error | DeltaNetServerError>;
```

## Usage Examples

### Async Connection Validation
```typescript
const server = new DeltaNetServer({
  onJoiner: async ({ token, internalConnectionId, components, states }) => {
    // The connection already has this ID - internalConnectionId is the actual ID
    console.log(`Validating user for connection ID ${internalConnectionId}`);
    
    // Validate user token against database
    const user = await database.validateToken(token);
    if (!user) {
      return new DeltaNetServerError("Invalid token", false);
    }

    // Check user permissions
    const permissions = await database.getUserPermissions(user.id);
    if (!permissions.canJoin) {
      return new DeltaNetServerError("Insufficient permissions", false);
    }

    // Log the successful connection
    console.log(`User ${user.id} authenticated with connection ID ${internalConnectionId}`);
    
    return true; // Accept the connection
  },

  onStatesUpdate: async ({ states, internalConnectionId }) => {
    const [stateId, stateValue] = states[0]; // Always exactly one state
    
    // Validate state against business rules
    const isValid = await gameRules.validateStateUpdate(internalConnectionId, stateId, stateValue);
    if (!isValid) {
      return new Error("Invalid state update");
    }
    
    return true;
  }
});
```

### Connection Lifecycle Logging
```typescript
const server = new DeltaNetServer({
  onJoiner: async ({ token, internalConnectionId, deltaNetV01Connection }) => {
    // Connection already has its ID and is managing its own state
    console.log(`Connection ${internalConnectionId} starting authentication...`);
    
    try {
      const user = await authenticateUser(token);
      console.log(`Connection ${internalConnectionId} authenticated as user ${user.id}`);
      return true;
    } catch (error) {
      console.log(`Connection ${internalConnectionId} authentication failed: ${error.message}`);
      return error;
    }
  },

  onLeave: ({ internalConnectionId }) => {
    console.log(`Connection ${internalConnectionId} disconnected`);
  }
});
```

## Architecture Details

### Connection Lifecycle

1. **WebSocket Creation**: When a WebSocket connects, a `DeltaNetV01Connection` is created
2. **Immediate ID Assignment**: The connection immediately gets a unique ID from the server
3. **Message Handling**: The connection listens for messages and handles them internally
4. **Authentication**: When `connectUser` message arrives, the connection handles the entire authentication process
5. **State Updates**: After authentication, the connection processes state updates independently

### Connection Responsibilities

- **ID Management**: Gets and stores its own connection ID immediately
- **Authentication**: Handles the entire joining process internally
- **State Validation**: Manages async state validation per state
- **Cleanup**: Automatically cancels pending validations on disposal

### Server Responsibilities

- **ID Generation**: Provides unique connection IDs
- **Callback Coordination**: Handles `onJoiner` and `onStatesUpdate` callbacks
- **Global State**: Manages the overall game state and tick system
- **Connection Registry**: Tracks authenticated connections

### Benefits

1. **Immediate Identity**: Connections have an identity from the moment they're created
2. **Self-Contained Logic**: Each connection manages its own lifecycle completely
3. **Simplified Server**: Server focuses on coordination rather than connection management
4. **Better Debugging**: Connection IDs are available for logging from the start
5. **Cleaner Architecture**: Clear separation of concerns between server and connections

## Migration Guide

### Key Changes

- **Connection ID Timing**: Connection IDs are now assigned immediately, not after authentication
- **Parameter Naming**: `internalConnectionId` is now the actual connection ID (name kept for clarity)
- **Self-Managed Connections**: Connections handle their own joining logic internally

### For `onJoiner` Callbacks

**Before:**
```typescript
onJoiner: async ({ token, internalConnectionId }) => {
  // internalConnectionId was what the connection would get IF accepted
  return await validateUser(token);
}
```

**After:**
```typescript
onJoiner: async ({ token, internalConnectionId }) => {
  // internalConnectionId is now the actual ID the connection already has
  console.log(`Authenticating connection ${internalConnectionId}`);
  return await validateUser(token);
}
```

## Implementation Notes

- Each connection gets its ID from `server.getNextConnectionId()` in the constructor
- Authentication state is tracked per connection with `isAuthenticated` flag
- The server's `validateJoiner` method handles the callback, connection tracks the state
- Connection disposal automatically handles all cleanup including pending validations
- Backward compatibility is maintained for all existing callback signatures 
