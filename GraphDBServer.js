// ========================================================================
// GDB - Distributed Graph Database (Server Implementation)
// ========================================================================
// Core Capabilities:
// - Real-time P2P synchronization | Local file system persistence
// - Automatic conflict resolution | Compressed data transfer
//
// Architecture: CRDTs + MessagePack + WebRTC + Node.js File System
//
// Sync Features:
// - P2P synchronization with LWW (Last-Write-Wins) conflict resolution ⚖️
// - Hybrid approach: Timestamp-based merging
// - Local file system persistence for server-side storage
//
// Dependencies:
// - @msgpack/msgpack: For serialization
// - pako: For compression
// - trystero: For P2P communication
// - fs/promises: For local file system operations
// - webrtc-polyfill: For WebRTC compatibility in Node.js
// - HybridClock: For timestamp management
// ========================================================================

import express from 'express'
import fs from 'fs/promises'
import path from 'path'
import { joinRoom } from 'trystero'
import { resolveConflict } from './conflictResolver.js'
import { encode, decode } from '@msgpack/msgpack'
import pako from 'pako'
import { RTCPeerConnection } from 'webrtc-polyfill' // Import the polyfill
import { HybridClock } from './HybridClock.js'

class Graph {
  constructor() {
    this.nodes = {}
  }

  insert(id, value, timestamp) {
    this.nodes[id] = { id, value, edges: [], timestamp }
  }

  get(id) {
    return this.nodes[id] || null
  }

  link(sourceId, targetId) {
    const sourceNode = this.nodes[sourceId]
    const targetNode = this.nodes[targetId]
    if (sourceNode && targetNode && !sourceNode.edges.includes(targetId)) {
      sourceNode.edges.push(targetId) // Only store IDs
    }
  }

  getAllNodes() {
    return Object.values(this.nodes)
  }

  serialize() {
    return pako.deflate(encode(this.nodes))
  }

  deserialize(data) {
    this.nodes = decode(pako.inflate(new Uint8Array(data)))
  }
}

// GraphDB Server Implementation
export default class GraphDBServer {
  constructor(name = process.env.GRAPHDB_ROOM || process.argv[2] || 'default', { password } = {}, storageDir = './storage') {
    this.hybridClock = new HybridClock()
    this.globalTimestamp = { physical: 0, logical: 0 } // Initialize global timestamp
    this.name = name
    this.password = password
    this.graph = new Graph()
    this.storageDir = storageDir
    this.clients = new Set() // Store SSE clients

    // Ensure the storage directory exists
    this.ensureStorageDirectory()

    // Wait for the graph and timestamp to load from the local file system
    this.ready = Promise.all([
      this.loadGraphFromLocalStorage(),
      this.loadGlobalTimestampFromLocalStorage()
    ]).then(() => {
      // ¡AQUÍ! Actualizar el reloj híbrido con el timestamp cargado
      if (this.globalTimestamp.physical !== 0 || this.globalTimestamp.logical !== 0) {
        console.log('Updating hybrid clock with loaded global timestamp:', this.globalTimestamp)
        // Suponiendo que existe un método 'update' en HybridClock
        // para ajustar su estado interno basado en un timestamp recibido/cargado.
        this.hybridClock.update(this.globalTimestamp)
      }
      console.log('GraphDB Server Ready.')
    }).catch(error => {
      console.error('Error during initialization:', error)
    })

    // Trystero configuration with unique key based on the database name
    const key = `graph-sync-room-${this.name}`
    console.log(`   P2P room key: ${key}`)
    const roomConfig = {
      appId: '1234',
      ...(this.password && { password: this.password }),
      rtcPolyfill: RTCPeerConnection // Use the webrtc-polyfill here
    }

    const room = joinRoom(roomConfig, key)
    this.room = room
    const [sendData, getData] = room.makeAction('syncGraph')
    this.sendData = sendData

    // Listen for changes on the P2P network
    getData(data => this.receiveChanges(data))

    // Handle peer connections
    room.onPeerJoin(peerId => {
      console.log('⚡ New peer connected:', peerId)
      this.broadcastToClients({ type: 'peerJoin', peerId })
      this.sendData([{ type: 'sync', timestamp: this.globalTimestamp }])
    })

    room.onPeerLeave(peerId => {
      console.log('⚡ Peer disconnected:', peerId)
      this.broadcastToClients({ type: 'peerLeave', peerId })
    })
  }

  // Broadcast events to all connected SSE clients
  broadcastToClients(event) {
    const data = `data: ${JSON.stringify(event)}\n\n`
    for (const client of this.clients) {
      client.write(data)
    }
  }

  // Ensure the storage directory exists
  async ensureStorageDirectory() {
    try {
      await fs.mkdir(this.storageDir, { recursive: true })
      console.log(`Storage directory created/exists: ${this.storageDir}`)
    } catch (error) {
      console.error('Error ensuring storage directory:', error.message)
    }
  }

  // Load the graph from the local file system
  async loadGraphFromLocalStorage() {
    try {
      const filePath = path.join(this.storageDir, `${this.name}_graph.msgpack`)
      let graphContent
      try {
        graphContent = await fs.readFile(filePath)
      } catch (error) {
        if (error.code === 'ENOENT') {
          console.warn("The file '_graph.msgpack' does not exist. Initializing an empty graph.")
          graphContent = new Uint8Array()
        } else {
          throw error
        }
      }
      if (graphContent.byteLength > 0) {
        this.graph.deserialize(graphContent)
        console.log(`Graph loaded from local storage: [ ${this.graph.getAllNodes().length} nodes ]`)
      } else {
        console.warn("The file '_graph.msgpack' is empty or could not be loaded.")
      }
    } catch (error) {
      console.error('Error loading graph from local storage:', error.message)
    }
  }

  // Save the graph to the local file system
  async saveGraphToLocalStorage() {
    try {
      const serializedGraph = this.graph.serialize()
      const filePath = path.join(this.storageDir, `${this.name}_graph.msgpack`)
      await fs.writeFile(filePath, Buffer.from(serializedGraph))
      console.log('Graph saved to local storage successfully.')
    } catch (error) {
      console.error('Error saving graph to local storage:', error.message)
    }
  }

  // Load the global timestamp from the local file system
  async loadGlobalTimestampFromLocalStorage() {
    try {
      const filePath = path.join(this.storageDir, `${this.name}_timestamp.json`)
      let timestampContent
      try {
        timestampContent = await fs.readFile(filePath, 'utf8')
      } catch (error) {
        if (error.code === 'ENOENT') {
          console.warn("The file '_timestamp.json' does not exist. Initializing with default timestamp.")
          // this.globalTimestamp = { physical: 0, logical: 0 } // Default value
          await this.saveGlobalTimestampToLocalStorage() // Ensure the file is created
          return
        } else {
          throw error
        }
      }
      if (timestampContent) {
        const parsedTimestamp = JSON.parse(timestampContent)
        if (parsedTimestamp && typeof parsedTimestamp.physical === 'number' && typeof parsedTimestamp.logical === 'number') {
          this.globalTimestamp = parsedTimestamp // Assign only if format is correct
          console.log('Global timestamp loaded from local storage:', this.globalTimestamp)
        } else {
          console.warn("Invalid timestamp format in '_timestamp.json'. Initializing with default timestamp.")
          this.globalTimestamp = { physical: 0, logical: 0 } // Default value
          await this.saveGlobalTimestampToLocalStorage() // Ensure the file is created
        }
      }
    } catch (error) {
      console.error('Error loading global timestamp from local storage:', error.message)
    }
  }

  // Save the global timestamp to the local file system
  async saveGlobalTimestampToLocalStorage() {
    try {
      const filePath = path.join(this.storageDir, `${this.name}_timestamp.json`)
      await fs.writeFile(filePath, JSON.stringify(this.globalTimestamp), 'utf8')
      console.log('Global timestamp saved to local storage successfully.')
    } catch (error) {
      console.error('Error saving global timestamp to local storage:', error.message)
    }
  }

  // Update the global timestamp and save it to disk
  async updateGlobalTimestamp(newTimestamp) {
    // Validación básica del timestamp entrante
    if (!newTimestamp || typeof newTimestamp.physical !== 'number' || typeof newTimestamp.logical !== 'number') {
      // console.warn('updateGlobalTimestamp called with invalid or missing timestamp:', newTimestamp);
      return;
    }

    // Solo actualizar y guardar si:
    // 1. globalTimestamp aún no se ha establecido (es null o el valor inicial {0,0}).
    // 2. O si newTimestamp es estrictamente más reciente que el globalTimestamp actual.
    if (!this.globalTimestamp ||
      (this.globalTimestamp.physical === 0 && this.globalTimestamp.logical === 0) ||
      this.hybridClock.compare(newTimestamp, this.globalTimestamp) > 0) {

      // console.log('Updating global timestamp from:', this.globalTimestamp, 'to:', newTimestamp);
      this.globalTimestamp = newTimestamp;
      await this.saveGlobalTimestampToLocalStorage();
    }
  }

  // Replace the local graph with the remote graph and save changes
  async applyFullGraph(remoteGraph) {
    try {
      this.graph.nodes = { ...remoteGraph.nodes }

      if (remoteGraph.timestamp) {
        this.hybridClock.update(remoteGraph.timestamp); // <--- update hybridClock
        this.updateGlobalTimestamp(remoteGraph.timestamp);
      }
      await this.saveGraphToLocalStorage()
      console.log('Applied full graph from remote node.')
    } catch (error) {
      console.error(`Error applying the full graph: ${error.message}`)
    }
  }

  // Auxiliar para evitar repetir lógica
  updateClockAndTimestamp = async function (timestamp) { // async
    this.hybridClock.update(timestamp);
    await this.updateGlobalTimestamp(timestamp); // await
  }
  // Handle incoming changes and apply them to the graph
  async receiveChanges(changes) {
    const handlers = {
      insert: async change => {
        this.graph.insert(change.id, change.value, change.timestamp)
        await this.updateClockAndTimestamp.call(this, change.timestamp)
      },
      update: async change => {
        const node = this.graph.get(change.id)
        const resolution = resolveConflict(node, change, this.hybridClock)
        if (resolution.resolved) {
          Object.assign(node, {
            value: resolution.value,
            timestamp: resolution.timestamp
          })
          await this.updateClockAndTimestamp.call(this, resolution.timestamp)
        }
      },
      remove: async change => {
        if (this.graph.nodes[change.id]) {
          delete this.graph.nodes[change.id]
          await this.updateClockAndTimestamp.call(this, change.timestamp)
        }
      },
      link: async change => {
        if (this.graph.nodes[change.sourceId] && this.graph.nodes[change.targetId]) {
          this.graph.link(change.sourceId, change.targetId)
          await this.updateClockAndTimestamp.call(this, change.timestamp)
        }
      },
      sync: async change => {
        this.hybridClock.update(change.timestamp)
        if (this.hybridClock.compare(this.globalTimestamp, change.timestamp) > 0) {
          console.log('Sending recent data to the remote node.')
          this.sendData([{ type: 'syncReceive', graph: this.graph }])
        }
      },
      syncReceive: async change => {
        await this.applyFullGraph(change.graph)
      }
    }

    for (const change of changes) {
      await handlers[change.type]?.(change)
    }

    await this.saveGraphToLocalStorage()
  }
}

// Initialize the server
const graphDBServer = new GraphDBServer(process.env.GRAPHDB_ROOM || process.argv[2] || 'default')

// Express setup
const app = express()
const PORT = process.env.PORT || 3000

// Middleware to parse JSON
app.use(express.json())

// Endpoint to serve the HTML page
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  res.write(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>GraphDB Real-Time Connections</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 20px;
          }
          #connections {
            margin-top: 20px;
          }
          .peer {
            padding: 10px;
            border-bottom: 1px solid #ccc;
          }
        </style>
      </head>
      <body>
        <h1>GraphDB Real-Time Connections</h1>
        <div id="connections">
          <p>No connections yet :-).</p>
        </div>
        <script>
          const connectionsDiv = document.getElementById("connections");
          const eventSource = new EventSource("/events");
          eventSource.onmessage = event => {
            const data = JSON.parse(event.data);
            if (data.type === "peerJoin") {
              addPeer(data.peerId);
            } else if (data.type === "peerLeave") {
              removePeer(data.peerId);
            }
          };
          function addPeer(peerId) {
            const existingPeer = document.querySelector(\`[data-peer-id="\${peerId}"]\`);
            if (existingPeer) return;
            const div = document.createElement("div");
            div.className = "peer";
            div.setAttribute("data-peer-id", peerId);
            div.textContent = \`Peer: \${peerId}\`;
            connectionsDiv.appendChild(div);
            const noConnectionsMessage = connectionsDiv.querySelector("p");
            if (noConnectionsMessage) {
              connectionsDiv.removeChild(noConnectionsMessage);
            }
          }
          function removePeer(peerId) {
            const peerDiv = document.querySelector(\`[data-peer-id="\${peerId}"]\`);
            if (peerDiv) {
              connectionsDiv.removeChild(peerDiv);
            }
            if (connectionsDiv.children.length === 0) {
              const noConnectionsMessage = document.createElement("p");
              noConnectionsMessage.textContent = "No connections yet :-).";
              connectionsDiv.appendChild(noConnectionsMessage);
            }
          }
        </script>
      </body>
      </html>
    `)

  res.end()
})

// Endpoint for SSE
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  graphDBServer.clients.add(res)
  req.on('close', () => {
    graphDBServer.clients.delete(res)
  })
})

// Start the Express server
app.listen(PORT, () => {
  console.log(`⚡ Server listening on port ${PORT}`)
})
