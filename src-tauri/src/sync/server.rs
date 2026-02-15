use axum::{
    extract::{DefaultBodyLimit, State},
    routing::post,
    Json, Router,
};
use std::sync::Arc;
use tokio::net::{TcpListener, UdpSocket};
use tokio::sync::Mutex;

use super::types::{
    DiscoveredDevice, DiscoveryBroadcast, SyncAction, SyncEvent, SyncRequest, SyncResponse,
    SyncStoryPreview, APP_IDENTIFIER, DISCOVERY_PORT,
};

/// Shared state for the sync server
#[derive(Clone)]
pub struct ServerState {
    /// Authentication token
    pub token: String,
    /// Stories available on this server (JSON strings in Aventura format)
    pub stories: Arc<Mutex<Vec<StoriesData>>>,
    /// Stories received from clients (pushed stories)
    pub received_stories: Arc<Mutex<Vec<String>>>,
    /// Activity events for the mobile UI (connected, pulled, pushed)
    pub sync_events: Arc<Mutex<Vec<SyncEvent>>>,
}

/// Data about a story available on the server
#[derive(Clone)]
pub struct StoriesData {
    pub preview: SyncStoryPreview,
    pub full_data: String,
}

impl ServerState {
    pub fn new(token: String) -> Self {
        Self {
            token,
            stories: Arc::new(Mutex::new(Vec::new())),
            received_stories: Arc::new(Mutex::new(Vec::new())),
            sync_events: Arc::new(Mutex::new(Vec::new())),
        }
    }
}

/// Derive a 6-digit numeric connect code from a UUID token.
/// Used for manual entry authentication as an alternative to the full token.
pub fn token_to_connect_code(token: &str) -> String {
    let clean = token.replace('-', "");
    // Take first 8 hex chars and convert to a number, then mod 1_000_000
    let hex_str = if clean.len() >= 8 {
        &clean[..8]
    } else {
        &clean
    };
    let val = u32::from_str_radix(hex_str, 16).unwrap_or(0);
    format!("{:06}", val % 1_000_000)
}

/// Validate an authentication token.
/// Accepts either the full UUID token or the derived 6-digit connect code.
pub fn validate_token(request_token: &str, server_token: &str) -> bool {
    request_token == server_token || request_token == token_to_connect_code(server_token)
}

/// Bind a listener for the sync HTTP server on a random local port
pub async fn bind_listener() -> Result<TcpListener, String> {
    TcpListener::bind("0.0.0.0:0")
        .await
        .map_err(|e| format!("Failed to bind server: {}", e))
}

/// Bind a listener on a specific port (used on mobile for fixed SYNC_PORT)
pub async fn bind_listener_on_port(port: u16) -> Result<TcpListener, String> {
    TcpListener::bind(format!("0.0.0.0:{}", port))
        .await
        .map_err(|e| format!("Failed to bind server on port {}: {}", port, e))
}

/// Build the sync router with shared state
pub fn build_router(state: ServerState) -> Router {
    Router::new()
        .route("/sync", post(handle_sync))
        // Increase body limit to 100MB for large stories with embedded images
        .layer(DefaultBodyLimit::max(100 * 1024 * 1024))
        .with_state(state)
}

/// Start the sync HTTP server task
pub fn spawn_server(listener: TcpListener, app: Router) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, app).await {
            eprintln!("Sync server error: {}", e);
        }
    })
}

/// Handle sync requests
async fn handle_sync(
    State(state): State<ServerState>,
    Json(request): Json<SyncRequest>,
) -> Json<SyncResponse> {
    // Validate token (accepts full token or connect code)
    if !validate_token(&request.token, &state.token) {
        return Json(SyncResponse::Error {
            message: "Invalid authentication token".to_string(),
        });
    }

    match request.action {
        SyncAction::ListStories => {
            let stories = state.stories.lock().await;
            let previews: Vec<SyncStoryPreview> =
                stories.iter().map(|s| s.preview.clone()).collect();
            let count = previews.len();

            // Log connection event
            {
                let mut events = state.sync_events.lock().await;
                events.push(SyncEvent {
                    event_type: "connected".to_string(),
                    message: format!("PC connected — {} stories available", count),
                });
            }

            Json(SyncResponse::StoriesList { stories: previews })
        }
        SyncAction::PullStory { story_id } => {
            let stories = state.stories.lock().await;
            if let Some(story) = stories.iter().find(|s| s.preview.id == story_id) {
                let title = story.preview.title.clone();

                // Log pull event
                {
                    let mut events = state.sync_events.lock().await;
                    events.push(SyncEvent {
                        event_type: "pulled".to_string(),
                        message: format!("Sent \"{}\" to PC", title),
                    });
                }

                Json(SyncResponse::StoryData {
                    data: story.full_data.clone(),
                })
            } else {
                Json(SyncResponse::Error {
                    message: format!("Story not found: {}", story_id),
                })
            }
        }
        SyncAction::PushStory { story_data } => {
            // Log push event
            {
                let mut events = state.sync_events.lock().await;
                events.push(SyncEvent {
                    event_type: "pushed".to_string(),
                    message: "Receiving story from PC...".to_string(),
                });
            }

            let mut received = state.received_stories.lock().await;
            received.push(story_data);
            Json(SyncResponse::Success {
                message: "Story received successfully".to_string(),
            })
        }
    }
}

// ---------------------------------------------------------------------------
// UDP Discovery (Corrected roles)
//
// Mobile (server) LISTENS on DISCOVERY_PORT and RESPONDS to discovery requests.
// PC (client) SENDS broadcast discovery requests and collects responses.
//
// This ensures the PC only makes outbound UDP traffic (allowed by firewalls),
// while the mobile listens on a fixed port (permissive on Android/iOS WiFi).
// ---------------------------------------------------------------------------

/// Magic bytes for discovery request (sent by PC)
const DISCOVERY_REQUEST: &[u8] = b"AVENTURAS_DISCOVER";

/// Spawn a UDP discovery responder (mobile).
/// Listens on `DISCOVERY_PORT` for discovery requests from PCs and responds
/// with the server's connection info (unicast back to the requesting PC).
pub fn spawn_discovery_responder(
    response_data: DiscoveryBroadcast,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        // Use std socket first to set SO_REUSEADDR before binding
        let std_socket = match std::net::UdpSocket::bind(format!("0.0.0.0:{}", DISCOVERY_PORT)) {
            Ok(s) => s,
            Err(e) => {
                eprintln!(
                    "[Sync] Failed to bind discovery responder on port {}: {}",
                    DISCOVERY_PORT, e
                );
                return;
            }
        };
        std_socket.set_nonblocking(true).ok();
        std_socket.set_broadcast(true).ok();

        let socket = match UdpSocket::from_std(std_socket) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[Sync] Failed to convert discovery responder socket: {}", e);
                return;
            }
        };

        eprintln!(
            "[Sync] Discovery responder listening on UDP port {}",
            DISCOVERY_PORT
        );

        let response_json = match serde_json::to_string(&response_data) {
            Ok(j) => j,
            Err(e) => {
                eprintln!("[Sync] Failed to serialize discovery response: {}", e);
                return;
            }
        };

        let mut buf = [0u8; 256];
        loop {
            match socket.recv_from(&mut buf).await {
                Ok((len, src_addr)) => {
                    // Check if it's a valid discovery request
                    if len >= DISCOVERY_REQUEST.len()
                        && &buf[..DISCOVERY_REQUEST.len()] == DISCOVERY_REQUEST
                    {
                        eprintln!(
                            "[Sync] Discovery request received from {}, responding...",
                            src_addr
                        );
                        // Respond directly to the requesting PC (unicast)
                        let _ = socket.send_to(response_json.as_bytes(), src_addr).await;
                    }
                }
                Err(e) => {
                    eprintln!("[Sync] Discovery responder recv error: {}", e);
                    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                }
            }
        }
    })
}

/// Compute broadcast addresses for local network discovery.
/// Returns a list of addresses to try: subnet-directed broadcast first,
/// then the limited broadcast as fallback.
///
/// Subnet-directed broadcast (e.g., 192.168.1.255) is the industry-standard
/// approach for local service discovery — it is reliably forwarded by routers
/// within the subnet and works on both Windows and Android, unlike the
/// limited broadcast address 255.255.255.255 which many OSes and routers drop.
fn compute_broadcast_targets() -> Vec<String> {
    let mut targets = Vec::new();

    // Try to get local IP and compute subnet-directed broadcast (assume /24)
    if let Ok(ip) = local_ip_address::local_ip() {
        if let std::net::IpAddr::V4(v4) = ip {
            let octets = v4.octets();
            let subnet_broadcast =
                format!("{}.{}.{}.255:{}", octets[0], octets[1], octets[2], DISCOVERY_PORT);
            targets.push(subnet_broadcast);
        }
    }

    // Fallback: limited broadcast (less reliable but covers edge cases)
    targets.push(format!("255.255.255.255:{}", DISCOVERY_PORT));

    targets
}

/// Spawn a UDP discovery requester (PC).
/// Periodically sends discovery requests to subnet-directed broadcast addresses
/// and collects unicast responses from mobile devices.
pub fn spawn_discovery_requester(
    devices: Arc<Mutex<Vec<DiscoveredDevice>>>,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        // Bind to a random port (outbound — firewall-friendly)
        let socket = match UdpSocket::bind("0.0.0.0:0").await {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[Sync] Failed to bind discovery requester socket: {}", e);
                return;
            }
        };
        if socket.set_broadcast(true).is_err() {
            eprintln!("[Sync] Failed to enable broadcast on discovery socket");
            return;
        }

        let broadcast_targets = compute_broadcast_targets();
        eprintln!(
            "[Sync] Discovery broadcasting to: {:?}",
            broadcast_targets
        );

        let mut buf = [0u8; 4096];

        loop {
            // Send discovery request to all broadcast addresses
            for target in &broadcast_targets {
                let _ = socket.send_to(DISCOVERY_REQUEST, target).await;
            }

            // Listen for unicast responses for 2 seconds
            let deadline =
                tokio::time::Instant::now() + std::time::Duration::from_secs(2);
            loop {
                let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
                if remaining.is_zero() {
                    break;
                }

                match tokio::time::timeout(remaining, socket.recv_from(&mut buf)).await {
                    Ok(Ok((len, _addr))) => {
                        if let Ok(broadcast) =
                            serde_json::from_slice::<DiscoveryBroadcast>(&buf[..len])
                        {
                            if broadcast.app == APP_IDENTIFIER {
                                let device = DiscoveredDevice {
                                    ip: broadcast.ip,
                                    port: broadcast.port,
                                    token: broadcast.token,
                                    version: broadcast.version,
                                    device_name: broadcast.device_name,
                                };
                                let mut list = devices.lock().await;
                                if let Some(existing) =
                                    list.iter_mut().find(|d| d.ip == device.ip)
                                {
                                    *existing = device;
                                } else {
                                    list.push(device);
                                }
                            }
                        }
                    }
                    _ => break, // Timeout or error — send next round
                }
            }
        }
    })
}

/// Get a human-readable device name based on the target platform.
pub fn get_device_name() -> String {
    #[cfg(target_os = "android")]
    {
        "Android Device".to_string()
    }
    #[cfg(target_os = "ios")]
    {
        "iOS Device".to_string()
    }
    #[cfg(target_os = "windows")]
    {
        "Windows PC".to_string()
    }
    #[cfg(target_os = "linux")]
    {
        "Linux PC".to_string()
    }
    #[cfg(target_os = "macos")]
    {
        "Mac".to_string()
    }
    #[cfg(not(any(
        target_os = "android",
        target_os = "ios",
        target_os = "windows",
        target_os = "linux",
        target_os = "macos"
    )))]
    {
        "Unknown Device".to_string()
    }
}
