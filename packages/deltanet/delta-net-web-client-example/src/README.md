# Delta Net Bot Runner

This tool allows you to create and run multiple bot clients that connect to a Delta Net server, imitating the behavior of real web clients.

## Features

- Create and manage multiple bots connecting to the same Delta Net server
- Configure bot behavior with custom update intervals and data patterns
- Randomize initial values and updates for testing
- Monitor the status of all bots running

## Usage

### Basic Example

```typescript
import { BotRunner } from "./botRunner";

// Create a bot runner with default server URL (ws://localhost:7971/delta-net-websocket)
const botRunner = new BotRunner();

// Add a bot with specific configuration
botRunner.addBot({
  id: 101,
  updateInterval: 500, // milliseconds between updates
  valuesToUpdate: [1, 2], // component IDs to update
  randomizeInitial: true, // use random initial values
});

// Start all bots
botRunner.startAll();

// When done, stop all bots
// botRunner.stopAll();
```

### Adding Multiple Random Bots

```typescript
// Add 10 bots with randomized behavior
botRunner.addRandomBots(10, {
  // Optional configuration override for all bots
  updateInterval: 300,
  randomRange: { min: 0, max: 100 },
});
```

### Bot Configuration Options

```typescript
interface BotConfig {
  id: number;                                 // Unique identifier for this bot
  updateInterval?: number;                    // Milliseconds between updates (default: 500)
  valuesToUpdate?: number[];                  // Component IDs to update (default: [1, 2])
  initialValues?: Map<number, number>;        // Specific initial values for components
  randomizeInitial?: boolean;                 // Use random initial values (default: false)
  randomRange?: { min: number; max: number }; // Range for random initial values (default: 0-128)
  updateRandomRange?: { min: number; max: number }; // Range for random updates (default: -4 to 4)
}
```

## Running the Example

To run the provided example:

```bash
# Make sure to build the project first
npm run build

# Run the example
node build/startBots.js
```

## Implementation Details

The BotRunner and Bot classes closely mimic the behavior of real web clients by:

1. Establishing WebSocket connections to the Delta Net server
2. Handling component deltas and user indices
3. Updating component values periodically
4. Tracking connection status and bandwidth

This is useful for testing server capacity, synchronization behavior, and network performance under load. 