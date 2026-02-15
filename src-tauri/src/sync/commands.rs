use base64::{engine::general_purpose::STANDARD, Engine};
use image::Luma;
use qrcode::QrCode;
use std::io::Cursor;
use std::sync::Arc;
use tauri::{AppHandle, State};
use tokio::sync::Mutex;
use uuid::Uuid;

use super::server::{
    bind_listener_on_port, build_router, get_device_name, spawn_discovery_requester,
    spawn_discovery_responder, spawn_server, token_to_connect_code, ServerState, StoriesData,
};
use super::types::{
    DiscoveredDevice, DiscoveryBroadcast, QrCodeData, SyncAction, SyncEvent, SyncRequest,
    SyncResponse, SyncServerInfo, SyncStoryPreview, APP_IDENTIFIER, SYNC_PORT,
};

/// State managed by Tauri for sync operations
pub struct SyncState {
    /// Handle to the running HTTP server task
    server_handle: Arc<Mutex<Option<tokio::task::JoinHandle<()>>>>,
    /// Current server state (for accessing received stories)
    server_state: Arc<Mutex<Option<ServerState>>>,
    /// Handle to the UDP broadcast task (mobile only)
    broadcast_handle: Arc<Mutex<Option<tokio::task::JoinHandle<()>>>>,
    /// Handle to the UDP discovery listener task (PC only)
    discovery_handle: Arc<Mutex<Option<tokio::task::JoinHandle<()>>>>,
    /// Devices discovered via UDP broadcast (PC only)
    discovered_devices: Arc<Mutex<Vec<DiscoveredDevice>>>,
}

impl Default for SyncState {
    fn default() -> Self {
        Self {
            server_handle: Arc::new(Mutex::new(None)),
            server_state: Arc::new(Mutex::new(None)),
            broadcast_handle: Arc::new(Mutex::new(None)),
            discovery_handle: Arc::new(Mutex::new(None)),
            discovered_devices: Arc::new(Mutex::new(Vec::new())),
        }
    }
}

/// Generate a QR code as base64-encoded PNG
fn generate_qr_code(data: &str) -> Result<String, String> {
    let code =
        QrCode::new(data.as_bytes()).map_err(|e| format!("Failed to create QR code: {}", e))?;

    let image = code.render::<Luma<u8>>().min_dimensions(256, 256).build();

    let mut buffer = Vec::new();
    image
        .write_to(&mut Cursor::new(&mut buffer), image::ImageFormat::Png)
        .map_err(|e| format!("Failed to encode QR code: {}", e))?;

    Ok(STANDARD.encode(&buffer))
}

/// Get the local IP address
fn get_local_ip() -> Result<String, String> {
    local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .map_err(|e| format!("Failed to get local IP: {}", e))
}

/// Parse story preview from Aventura export JSON
fn parse_story_preview(json: &str) -> Result<SyncStoryPreview, String> {
    let data: serde_json::Value =
        serde_json::from_str(json).map_err(|e| format!("Invalid JSON: {}", e))?;

    let story = data
        .get("story")
        .ok_or("Missing 'story' field in export")?;
    let entries = data
        .get("entries")
        .and_then(|e| e.as_array())
        .map(|a| a.len())
        .unwrap_or(0);

    Ok(SyncStoryPreview {
        id: story
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        title: story
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("Untitled")
            .to_string(),
        genre: story
            .get("genre")
            .and_then(|v| v.as_str())
            .map(String::from),
        updated_at: story
            .get("updatedAt")
            .and_then(|v| v.as_i64())
            .unwrap_or(0),
        entry_count: entries,
    })
}

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

/// Returns whether this build targets a mobile platform.
fn is_mobile() -> bool {
    cfg!(any(target_os = "android", target_os = "ios"))
}

/// Get the sync role for this platform.
/// Mobile devices act as **server** (listen for connections).
/// Desktop devices act as **client** (initiate connections outbound).
#[tauri::command]
pub fn get_sync_role() -> String {
    if is_mobile() {
        "server".to_string()
    } else {
        "client".to_string()
    }
}

// ---------------------------------------------------------------------------
// Server commands (primarily used by mobile)
// ---------------------------------------------------------------------------

/// Start the sync server with available stories.
/// On mobile, binds to the fixed SYNC_PORT (55555).
/// On desktop, binds to a random available port (fallback / legacy).
#[tauri::command]
pub async fn start_sync_server(
    app: AppHandle,
    state: State<'_, SyncState>,
    stories_json: Option<Vec<String>>,
) -> Result<SyncServerInfo, String> {
    // Stop any existing server first
    stop_sync_server(state.clone()).await?;

    // Generate a new token
    let token = Uuid::new_v4().to_string();

    // Create server state
    let server_state = ServerState::new(token.clone());

    // Add stories if provided
    if let Some(stories) = stories_json {
        let mut stories_data = server_state.stories.lock().await;
        for story_json in stories {
            match parse_story_preview(&story_json) {
                Ok(preview) => {
                    stories_data.push(StoriesData {
                        preview,
                        full_data: story_json,
                    });
                }
                Err(e) => {
                    eprintln!("Failed to parse story: {}", e);
                }
            }
        }
    }

    // Always bind to the fixed SYNC_PORT so manual connect and discovery work.
    // Fail fast with a user-facing error if the port is occupied.
    let listener = bind_listener_on_port(SYNC_PORT).await.map_err(|_| {
        format!(
            "Unable to start sync: port {} is already in use. Please close any other app using this port and try again.",
            SYNC_PORT
        )
    })?;

    let addr = listener
        .local_addr()
        .map_err(|e| format!("Failed to get local address: {}", e))?;

    // Get local IP for QR data
    let ip = get_local_ip()?;
    let port = addr.port();

    // Generate connect code from token
    let connect_code = token_to_connect_code(&token);

    // Generate QR code with connection data
    let qr_data = QrCodeData {
        ip: ip.clone(),
        port,
        token: token.clone(),
        version: app.package_info().version.to_string(),
    };
    let qr_json = serde_json::to_string(&qr_data)
        .map_err(|e| format!("Failed to serialize QR data: {}", e))?;
    let qr_code_base64 = generate_qr_code(&qr_json)?;

    // Start the HTTP server
    let router = build_router(server_state.clone());
    let handle = spawn_server(listener, router);

    // Store handles
    *state.server_handle.lock().await = Some(handle);
    *state.server_state.lock().await = Some(server_state);

    Ok(SyncServerInfo {
        ip,
        port,
        token,
        qr_code_base64,
        connect_code,
    })
}

/// Stop the sync server and any associated broadcast
#[tauri::command]
pub async fn stop_sync_server(state: State<'_, SyncState>) -> Result<(), String> {
    // Stop HTTP server
    let mut handle = state.server_handle.lock().await;
    if let Some(h) = handle.take() {
        h.abort();
    }
    *state.server_state.lock().await = None;

    // Stop broadcast if running
    let mut broadcast = state.broadcast_handle.lock().await;
    if let Some(h) = broadcast.take() {
        h.abort();
    }

    Ok(())
}

/// Get stories that were pushed to this server
#[tauri::command]
pub async fn get_received_stories(state: State<'_, SyncState>) -> Result<Vec<String>, String> {
    let server_state = state.server_state.lock().await;
    if let Some(ref ss) = *server_state {
        let received = ss.received_stories.lock().await;
        Ok(received.clone())
    } else {
        Ok(Vec::new())
    }
}

/// Clear received stories after processing
#[tauri::command]
pub async fn clear_received_stories(state: State<'_, SyncState>) -> Result<(), String> {
    let server_state = state.server_state.lock().await;
    if let Some(ref ss) = *server_state {
        let mut received = ss.received_stories.lock().await;
        received.clear();
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Sync events (mobile server activity log)
// ---------------------------------------------------------------------------

/// Get sync events (connection, pull, push notifications) for the mobile UI.
/// Drains the pending events atomically so they are only delivered once.
#[tauri::command]
pub async fn get_sync_events(state: State<'_, SyncState>) -> Result<Vec<SyncEvent>, String> {
    let server_state = state.server_state.lock().await;
    if let Some(ref ss) = *server_state {
        let mut events = ss.sync_events.lock().await;
        let drained: Vec<SyncEvent> = events.drain(..).collect();
        Ok(drained)
    } else {
        Ok(Vec::new())
    }
}

/// Clear sync events — now a no-op since `get_sync_events` drains atomically.
/// Kept for API backwards compatibility.
#[tauri::command]
pub async fn clear_sync_events(_state: State<'_, SyncState>) -> Result<(), String> {
    Ok(())
}

// ---------------------------------------------------------------------------
// UDP discovery commands
//
// Mobile (server): listens on DISCOVERY_PORT and responds to requests.
// PC (client): broadcasts discovery requests and collects responses.
//
// This ensures the PC only makes OUTBOUND UDP traffic (allowed by firewalls).
// ---------------------------------------------------------------------------

/// Start the discovery responder (mobile).
/// Listens on DISCOVERY_PORT for requests from PCs and responds with server info.
/// Note: The token is NOT broadcast — authentication uses the connect code on-screen.
#[tauri::command]
pub async fn start_udp_broadcast(
    app: AppHandle,
    state: State<'_, SyncState>,
    ip: String,
    port: u16,
) -> Result<(), String> {
    // Stop existing responder
    let mut broadcast = state.broadcast_handle.lock().await;
    if let Some(h) = broadcast.take() {
        h.abort();
    }

    // Discovery response does NOT include the token for security.
    // Users authenticate via the 6-digit connect code shown on the mobile screen.
    let response_data = DiscoveryBroadcast {
        app: APP_IDENTIFIER.to_string(),
        ip,
        port,
        version: app.package_info().version.to_string(),
        device_name: get_device_name(),
    };

    let handle = spawn_discovery_responder(response_data);
    *broadcast = Some(handle);

    Ok(())
}

/// Stop the discovery responder
#[tauri::command]
pub async fn stop_udp_broadcast(state: State<'_, SyncState>) -> Result<(), String> {
    let mut broadcast = state.broadcast_handle.lock().await;
    if let Some(h) = broadcast.take() {
        h.abort();
    }
    Ok(())
}

/// Start the discovery requester (PC).
/// Broadcasts discovery requests and collects responses from mobile devices.
#[tauri::command]
pub async fn start_discovery(state: State<'_, SyncState>) -> Result<(), String> {
    // Stop existing requester
    let mut handle = state.discovery_handle.lock().await;
    if let Some(h) = handle.take() {
        h.abort();
    }

    // Clear previous discoveries
    {
        let mut devices = state.discovered_devices.lock().await;
        devices.clear();
    }

    let devices = Arc::clone(&state.discovered_devices);
    let requester = spawn_discovery_requester(devices);
    *handle = Some(requester);

    Ok(())
}

/// Stop the UDP discovery listener
#[tauri::command]
pub async fn stop_discovery(state: State<'_, SyncState>) -> Result<(), String> {
    let mut handle = state.discovery_handle.lock().await;
    if let Some(h) = handle.take() {
        h.abort();
    }
    // Clear discovered devices
    let mut devices = state.discovered_devices.lock().await;
    devices.clear();
    Ok(())
}

/// Get the list of devices discovered via UDP broadcast
#[tauri::command]
pub async fn get_discovered_devices(
    state: State<'_, SyncState>,
) -> Result<Vec<DiscoveredDevice>, String> {
    let devices = state.discovered_devices.lock().await;
    Ok(devices.clone())
}

// ---------------------------------------------------------------------------
// Client commands (PC connects outbound to mobile server)
// ---------------------------------------------------------------------------

/// Connect to a remote sync server and list available stories
#[tauri::command]
pub async fn sync_connect(
    ip: String,
    port: u16,
    token: String,
) -> Result<Vec<SyncStoryPreview>, String> {
    let url = format!("http://{}:{}/sync", ip, port);

    let request = SyncRequest {
        token,
        action: SyncAction::ListStories,
    };

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .json(&request)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;

    let sync_response: SyncResponse = response
        .json()
        .await
        .map_err(|e| format!("Invalid response: {}", e))?;

    match sync_response {
        SyncResponse::StoriesList { stories } => Ok(stories),
        SyncResponse::Error { message } => Err(message),
        _ => Err("Unexpected response type".to_string()),
    }
}

/// Pull a story from a remote server
#[tauri::command]
pub async fn sync_pull_story(
    ip: String,
    port: u16,
    token: String,
    story_id: String,
) -> Result<String, String> {
    let url = format!("http://{}:{}/sync", ip, port);

    let request = SyncRequest {
        token,
        action: SyncAction::PullStory { story_id },
    };

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .json(&request)
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;

    let sync_response: SyncResponse = response
        .json()
        .await
        .map_err(|e| format!("Invalid response: {}", e))?;

    match sync_response {
        SyncResponse::StoryData { data } => Ok(data),
        SyncResponse::Error { message } => Err(message),
        _ => Err("Unexpected response type".to_string()),
    }
}

/// Push a story to a remote server
#[tauri::command]
pub async fn sync_push_story(
    ip: String,
    port: u16,
    token: String,
    story_json: String,
) -> Result<(), String> {
    let url = format!("http://{}:{}/sync", ip, port);

    let request = SyncRequest {
        token,
        action: SyncAction::PushStory {
            story_data: story_json,
        },
    };

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .json(&request)
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;

    let sync_response: SyncResponse = response
        .json()
        .await
        .map_err(|e| format!("Invalid response: {}", e))?;

    match sync_response {
        SyncResponse::Success { .. } => Ok(()),
        SyncResponse::Error { message } => Err(message),
        _ => Err("Unexpected response type".to_string()),
    }
}
