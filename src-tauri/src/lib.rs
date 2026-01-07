use tauri_plugin_sql::{Migration, MigrationKind};

mod sync;

use sync::commands::{
    clear_received_stories, get_received_stories, start_sync_server, stop_sync_server,
    sync_connect, sync_pull_story, sync_push_story,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_initial_tables",
            sql: include_str!("../migrations/001_initial.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add_chapters_checkpoints_mode",
            sql: include_str!("../migrations/002_chapters_checkpoints.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add_entries_lorebook",
            sql: include_str!("../migrations/003_entries.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "add_entry_lore_blacklist",
            sql: include_str!("../migrations/004_entry_lore_blacklist.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "add_story_beats_resolved_at",
            sql: include_str!("../migrations/005_story_beats_resolved_at.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "add_story_retry_state",
            sql: include_str!("../migrations/006_story_retry_state.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .manage(sync::SyncState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:aventura.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            start_sync_server,
            stop_sync_server,
            get_received_stories,
            clear_received_stories,
            sync_connect,
            sync_pull_story,
            sync_push_story,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
