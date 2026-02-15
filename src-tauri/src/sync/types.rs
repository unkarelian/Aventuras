use serde::{Deserialize, Serialize};

/// Fixed port for the sync HTTP server (used on mobile)
pub const SYNC_PORT: u16 = 55555;

/// Fixed port for UDP discovery broadcasts
pub const DISCOVERY_PORT: u16 = 55556;

/// Application identifier for discovery broadcasts
pub const APP_IDENTIFIER: &str = "aventuras";

/// Information about the sync server, returned when starting a server
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncServerInfo {
    pub ip: String,
    pub port: u16,
    pub token: String,
    pub qr_code_base64: String,
    /// Short 6-digit numeric code for manual entry (derived from token)
    pub connect_code: String,
}

/// Preview of a story available for sync
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStoryPreview {
    pub id: String,
    pub title: String,
    pub genre: Option<String>,
    pub updated_at: i64,
    pub entry_count: usize,
}

/// Request sent to the sync server
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncRequest {
    pub token: String,
    pub action: SyncAction,
}

/// Actions that can be performed on the sync server
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum SyncAction {
    /// List all available stories on the server
    ListStories,
    /// Pull a specific story by ID
    PullStory { story_id: String },
    /// Push a story to the server
    PushStory { story_data: String },
}

/// Response from the sync server
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum SyncResponse {
    /// List of available stories
    StoriesList { stories: Vec<SyncStoryPreview> },
    /// Full story data (Aventura export JSON)
    StoryData { data: String },
    /// Operation succeeded
    Success { message: String },
    /// Operation failed
    Error { message: String },
}

/// Data encoded in the QR code
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QrCodeData {
    pub ip: String,
    pub port: u16,
    pub token: String,
    pub version: String, // App version for compatibility check
}

/// Data broadcast via UDP for device discovery
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryBroadcast {
    /// Application identifier ("aventuras")
    pub app: String,
    /// Server IP address
    pub ip: String,
    /// Server port (fixed SYNC_PORT)
    pub port: u16,
    /// Authentication token
    pub token: String,
    /// App version for compatibility check
    pub version: String,
    /// Human-readable device name
    pub device_name: String,
}

/// An event that occurred on the sync server, surfaced to the mobile UI
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncEvent {
    /// Event type: "connected", "pulled", "pushed"
    pub event_type: String,
    /// Human-readable description
    pub message: String,
}

/// A device discovered via UDP broadcast, returned to the frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredDevice {
    pub ip: String,
    pub port: u16,
    pub token: String,
    pub version: String,
    pub device_name: String,
}
