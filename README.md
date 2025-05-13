# GraphDB P2P Server Node

This repository contains the server-side implementation for a distributed graph database system. It acts as a **Persistent P2P Data Synchronization Node/Server**, enabling real-time data replication and consistency across a peer-to-peer network, with local file system persistence for data durability.

## Core Features

*   **Real-time P2P Synchronization:** Utilizes WebRTC (via Trystero) for direct peer-to-peer communication and graph data synchronization.
*   **Local File System Persistence:** Graph data and synchronization state (timestamps) are persisted locally using MessagePack for graph serialization and JSON for timestamps, ensuring data is not lost on restart.
*   **Automatic Conflict Resolution:** Implements a Last-Write-Wins (LWW) strategy for conflict resolution based on Hybrid Logical Clocks (HLCs) to maintain data consistency across distributed nodes.
*   **Compressed Data Transfer:** Graph data is compressed using Pako (zlib compression) before network transmission or local storage to reduce bandwidth and disk space usage.
*   **Built with Node.js & Express:** The server is built using Node.js and includes a minimal Express.js server for potential API extensions or status monitoring.
*   **SSE for Peer Monitoring:** Includes a Server-Sent Events (SSE) endpoint (`/events`) and a basic HTML page (`/`) to visualize real-time P2P connections.

## Architecture Overview

The server leverages a combination of technologies to achieve its goals:

*   **CRDTs (Conflict-free Replicated Data Types) Principles:** The LWW approach with HLCs is inspired by CRDT principles to ensure eventual consistency.
*   **MessagePack (`@msgpack/msgpack`):** For efficient binary serialization of graph data.
*   **Pako:** For GZIP compression/decompression of serialized data.
*   **Trystero:** For establishing and managing WebRTC P2P connections and data channels between server instances.
*   **Node.js File System (`fs/promises`):** For asynchronous local storage operations.
*   **WebRTC Polyfill (`webrtc-polyfill`):** To ensure WebRTC compatibility within the Node.js environment.
*   **Custom HybridClock:** A custom implementation for generating hybrid logical timestamps used in conflict resolution.

Each server instance joins a Trystero "room" based on a configurable database name. When changes occur on one node, they are propagated to other connected peers. Incoming changes are merged into the local graph, with conflicts resolved using the LWW strategy based on HLC timestamps. The graph state and the latest global timestamp are periodically saved to the local disk.

## Key Components

*   **`GraphDBServer.js`:** The main file containing the `GraphDBServer` class, which orchestrates P2P communication, data persistence, and Express server setup.
*   **`Graph` (class within `GraphDBServer.js`):** A simple in-memory representation of the graph data structure with methods for node/edge manipulation and serialization.
*   **`HybridClock.js`:** Implements the Hybrid Logical Clock for generating timestamps that help order events in a distributed environment.
*   **`conflictResolver.js`:** Contains the logic for resolving data conflicts between a local node and an incoming change using the LWW strategy and HLC timestamps.

## Getting Started

### Prerequisites

*   Node.js (version X.X.X or higher recommended)
*   npm or yarn

### Installation

1.  Clone the repository:
    ```bash
    git clone <your-repository-url>
    cd <repository-directory>
    ```
2.  Install dependencies:
    ```bash
    npm install
    # or
    # yarn install
    ```

### Running the Server

You can run the server using Node.js. You can specify a room name as a command-line argument or via an environment variable.

```bash
# Run with the default room name ("default")
node GraphDBServer.js

# Run with a specific room name
node GraphDBServer.js my-graph-database

# Or using an environment variable
GRAPHDB_ROOM=my-special-room node GraphDBServer.js