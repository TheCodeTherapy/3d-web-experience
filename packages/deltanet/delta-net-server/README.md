# DeltaNet Server
#### `@mml-io/delta-net-server`

[![npm version](https://img.shields.io/npm/v/@mml-io/delta-net-server.svg?style=flat)](https://www.npmjs.com/package/@mml-io/delta-net-server)

This package contains the `DeltaNetServer` class that provides a way to accept websocket connections that can each set int64 components and byte states which are then visible to every other connected user.

The WebSocket protocol used by this package, `delta-net-v0.1`, is defined in `@mml-io/delta-net-protocol`.

A client for the `delta-net-v0.1` protocol is provided by `@mml-io/delta-net-web`.
