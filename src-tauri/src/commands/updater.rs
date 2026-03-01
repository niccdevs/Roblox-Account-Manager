const UPDATER_MANIFEST_BASE: &str =
    "https://raw.githubusercontent.com/niccsprojects/Roblox-Account-Manager/update-manifests";

#[derive(Default)]
struct UpdaterRuntimeState {
    pending_update: std::sync::Mutex<Option<tauri_plugin_updater::Update>>,
    downloaded_bytes: std::sync::Mutex<Option<Vec<u8>>>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdaterCheckResponse {
    version: String,
    current_version: String,
    date: String,
    body: String,
    release_channel: String,
    feature_channel: String,
}

fn normalize_updater_release_channel(raw: &str) -> &'static str {
    if raw.eq_ignore_ascii_case("stable") {
        "stable"
    } else {
        "beta"
    }
}

fn normalize_updater_feature_channel(raw: &str) -> &'static str {
    if raw.eq_ignore_ascii_case("nexus-ws")
        || raw.eq_ignore_ascii_case("nexus")
        || raw.eq_ignore_ascii_case("full")
    {
        "nexus-ws"
    } else {
        "standard"
    }
}

fn resolve_manifest_channel(release_channel: &str, feature_channel: &str) -> String {
    if feature_channel == "nexus-ws" {
        format!("{}-nexus-ws", release_channel)
    } else {
        release_channel.to_string()
    }
}

fn build_manifest_endpoint(release_channel: &str, feature_channel: &str) -> Result<reqwest::Url, String> {
    let channel = resolve_manifest_channel(release_channel, feature_channel);
    let endpoint = format!("{}/{}/latest.json", UPDATER_MANIFEST_BASE, channel);
    reqwest::Url::parse(&endpoint).map_err(|e| format!("Invalid updater endpoint: {}", e))
}

fn update_payload_key(update: Option<&tauri_plugin_updater::Update>) -> Option<String> {
    update.map(|item| {
        format!(
            "{}|{}|{}|{}",
            item.version,
            item.target,
            item.download_url,
            item.signature
        )
    })
}

#[tauri::command]
async fn check_for_updates_with_channels(
    app: tauri::AppHandle,
    updater_state: tauri::State<'_, UpdaterRuntimeState>,
    release_channel: Option<String>,
    feature_channel: Option<String>,
) -> Result<Option<UpdaterCheckResponse>, String> {
    use tauri_plugin_updater::UpdaterExt;

    let normalized_release = normalize_updater_release_channel(
        release_channel.as_deref().unwrap_or("beta"),
    );
    let normalized_feature = normalize_updater_feature_channel(
        feature_channel.as_deref().unwrap_or("standard"),
    );

    let endpoint = build_manifest_endpoint(normalized_release, normalized_feature)?;
    let updater = app
        .updater_builder()
        .endpoints(vec![endpoint])
        .map_err(|e| format!("Failed to configure updater endpoint: {}", e))?
        .build()
        .map_err(|e| format!("Failed to initialize updater: {}", e))?;

    let update = updater
        .check()
        .await
        .map_err(|e| format!("Failed to check for updates: {}", e))?;

    let previous_payload_key = {
        let pending = updater_state
            .pending_update
            .lock()
            .map_err(|e| e.to_string())?;
        update_payload_key(pending.as_ref())
    };

    let next_payload_key = update_payload_key(update.as_ref());

    if previous_payload_key != next_payload_key {
        let mut downloaded = updater_state
            .downloaded_bytes
            .lock()
            .map_err(|e| e.to_string())?;
        *downloaded = None;
    }

    {
        let mut pending = updater_state
            .pending_update
            .lock()
            .map_err(|e| e.to_string())?;
        *pending = update.clone();
    }

    Ok(update.map(|item| UpdaterCheckResponse {
        version: item.version,
        current_version: item.current_version,
        date: item.date.map(|d| d.to_string()).unwrap_or_default(),
        body: item.body.unwrap_or_default(),
        release_channel: normalized_release.to_string(),
        feature_channel: normalized_feature.to_string(),
    }))
}

#[tauri::command]
async fn download_selected_update(
    updater_state: tauri::State<'_, UpdaterRuntimeState>,
) -> Result<(), String> {
    let update = {
        let pending = updater_state
            .pending_update
            .lock()
            .map_err(|e| e.to_string())?;
        pending
            .clone()
            .ok_or_else(|| "No pending update selected".to_string())?
    };

    let bytes = update
        .download(|_, _| {}, || {})
        .await
        .map_err(|e| format!("Failed to download update: {}", e))?;

    let mut downloaded = updater_state
        .downloaded_bytes
        .lock()
        .map_err(|e| e.to_string())?;
    *downloaded = Some(bytes);

    Ok(())
}

#[tauri::command]
fn install_selected_update(updater_state: tauri::State<'_, UpdaterRuntimeState>) -> Result<(), String> {
    let update = {
        let pending = updater_state
            .pending_update
            .lock()
            .map_err(|e| e.to_string())?;
        pending
            .clone()
            .ok_or_else(|| "No pending update selected".to_string())?
    };

    let bytes = {
        let downloaded = updater_state
            .downloaded_bytes
            .lock()
            .map_err(|e| e.to_string())?;
        downloaded
            .clone()
            .ok_or_else(|| "No downloaded update found".to_string())?
    };

    update
        .install(bytes)
        .map_err(|e| format!("Failed to install update: {}", e))
}
