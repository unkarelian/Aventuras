/**
 * Types for the local network sync feature
 *
 * Architecture: Mobile (Android/iOS) acts as the HTTP server on a fixed port.
 * Desktop (Windows/Linux/macOS) acts as the client, connecting outbound.
 * This avoids PC firewall issues since outbound connections are generally allowed.
 */

/**
 * Fixed port used by the mobile sync server
 */
export const SYNC_PORT = 55555

/**
 * The sync role for this platform.
 * - "server": Mobile device — listens for incoming connections.
 * - "client": Desktop/PC — initiates outbound connections.
 */
export type SyncRole = 'server' | 'client'

/**
 * Information about the sync server, returned when starting a server
 */
export interface SyncServerInfo {
  ip: string
  port: number
  token: string
  qrCodeBase64: string
  /** 6-digit numeric code for manual entry (derived from token) */
  connectCode: string
}

/**
 * Preview of a story available for sync
 */
export interface SyncStoryPreview {
  id: string
  title: string
  genre: string | null
  updatedAt: number
  entryCount: number
}

/**
 * Data encoded in the QR code for connection
 */
export interface SyncConnectionData {
  ip: string
  port: number
  token: string
  version?: string // App version for compatibility check (optional for backwards compat)
}

/**
 * A device discovered via UDP broadcast on the local network.
 * Does NOT contain the auth token — the user must enter the
 * 6-digit connect code displayed on the mobile device.
 */
export interface DiscoveredDevice {
  ip: string
  port: number
  version: string
  deviceName: string
}

/**
 * An event that occurred on the sync server (for mobile activity display)
 */
export interface SyncEvent {
  eventType: string
  message: string
}

/**
 * Current mode of the sync modal
 */
export type SyncMode =
  | 'role' // Role selection: Share or Receive (shown on all platforms)
  | 'select' // Client mode selection (scan/discover/manual)
  | 'generate' // Server mode: showing QR code
  | 'scan' // Client mode: scanning QR code with camera
  | 'discover' // Client mode: auto-discovering devices via UDP
  | 'manual' // Client mode: manually entering IP + connect code
  | 'connected' // Connected to remote, selecting stories
  | 'syncing' // Transfer in progress

/**
 * Action to perform when syncing
 */
export type SyncAction = 'push' | 'pull'
