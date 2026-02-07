mod api;
mod browser;
mod data;
mod nexus;
mod platform;

use std::collections::HashMap;
use tauri::{Emitter, Manager, AppHandle, Wry};
use tauri::menu::{MenuBuilder, MenuItemBuilder, MenuEvent};
use tauri::tray::{TrayIconBuilder, TrayIconEvent, TrayIcon, MouseButton, MouseButtonState};
use tauri_plugin_autostart::MacosLauncher;
use api::batch::ImageCache;
use data::accounts::{AccountStore, get_account_data_path};
use data::crypto;
use data::settings::{SettingsStore, ThemeStore, get_settings_path, get_theme_path};

#[tauri::command]
async fn validate_cookie(cookie: String) -> Result<api::auth::AccountInfo, String> {
    api::auth::validate_cookie(&cookie).await
}

#[tauri::command]
async fn get_csrf_token(state: tauri::State<'_, AccountStore>, user_id: i64) -> Result<String, String> {
    let cookie = get_cookie(&state, user_id)?;
    api::auth::get_csrf_token(&cookie).await
}

#[tauri::command]
async fn get_auth_ticket(state: tauri::State<'_, AccountStore>, user_id: i64) -> Result<String, String> {
    let cookie = get_cookie(&state, user_id)?;
    api::auth::get_auth_ticket(&cookie).await
}

#[tauri::command]
async fn check_pin(state: tauri::State<'_, AccountStore>, user_id: i64) -> Result<bool, String> {
    let cookie = get_cookie(&state, user_id)?;
    api::auth::check_pin(&cookie).await
}

#[tauri::command]
async fn unlock_pin(state: tauri::State<'_, AccountStore>, user_id: i64, pin: String) -> Result<bool, String> {
    let cookie = get_cookie(&state, user_id)?;
    api::auth::unlock_pin(&cookie, &pin).await
}

#[tauri::command]
async fn refresh_cookie(state: tauri::State<'_, AccountStore>, user_id: i64) -> Result<bool, String> {
    let cookie = get_cookie(&state, user_id)?;
    let result = api::auth::log_out_other_sessions(&cookie).await?;

    if let Some(new_cookie) = result.new_cookie {
        let accounts = state.get_all()?;
        if let Some(mut account) = accounts.into_iter().find(|a| a.user_id == user_id) {
            account.security_token = new_cookie;
            state.update(account)?;
        }
    }

    Ok(result.success)
}

#[tauri::command]
async fn get_robux(state: tauri::State<'_, AccountStore>, user_id: i64) -> Result<i64, String> {
    let cookie = get_cookie(&state, user_id)?;
    api::roblox::get_robux(&cookie).await
}

#[tauri::command]
async fn get_user_info(user_id: i64) -> Result<api::roblox::UserInfo, String> {
    api::roblox::get_user_info(None, user_id).await
}

#[tauri::command]
async fn lookup_user(username: String) -> Result<api::roblox::UserLookupResult, String> {
    api::roblox::get_user_id(None, &username).await
}

#[tauri::command]
async fn test_auth(cookie: String) -> Result<String, String> {
    let mut results = Vec::new();

    results.push(format!("Cookie length: {}", cookie.len()));

    match api::auth::validate_cookie(&cookie).await {
        Ok(info) => results.push(format!("Validate: OK - {} (ID: {})", info.name, info.user_id)),
        Err(e) => results.push(format!("Validate: FAILED - {}", e)),
    }

    match api::auth::get_csrf_token(&cookie).await {
        Ok(token) => results.push(format!("CSRF: OK - {}...", &token[..token.len().min(16)])),
        Err(e) => results.push(format!("CSRF: FAILED - {}", e)),
    }

    match api::auth::get_auth_ticket(&cookie).await {
        Ok(ticket) => results.push(format!("Ticket: OK - {}...", &ticket[..ticket.len().min(20)])),
        Err(e) => results.push(format!("Ticket: FAILED - {}", e)),
    }

    Ok(results.join("\n"))
}

#[tauri::command]
async fn send_friend_request(
    state: tauri::State<'_, AccountStore>,
    user_id: i64,
    target_user_id: i64,
) -> Result<(), String> {
    let cookie = get_cookie(&state, user_id)?;
    api::roblox::send_friend_request(&cookie, target_user_id).await
}

#[tauri::command]
async fn block_user(
    state: tauri::State<'_, AccountStore>,
    user_id: i64,
    target_user_id: i64,
) -> Result<(), String> {
    let cookie = get_cookie(&state, user_id)?;
    api::roblox::block_user(&cookie, target_user_id).await
}

#[tauri::command]
async fn unblock_user(
    state: tauri::State<'_, AccountStore>,
    user_id: i64,
    target_user_id: i64,
) -> Result<(), String> {
    let cookie = get_cookie(&state, user_id)?;
    api::roblox::unblock_user(&cookie, target_user_id).await
}

#[tauri::command]
async fn get_blocked_users(
    state: tauri::State<'_, AccountStore>,
    user_id: i64,
) -> Result<Vec<api::roblox::BlockedUser>, String> {
    let cookie = get_cookie(&state, user_id)?;
    api::roblox::get_blocked_users(&cookie).await
}

#[tauri::command]
async fn unblock_all_users(
    state: tauri::State<'_, AccountStore>,
    user_id: i64,
) -> Result<i32, String> {
    let cookie = get_cookie(&state, user_id)?;
    api::roblox::unblock_all_users(&cookie).await
}

#[tauri::command]
async fn set_follow_privacy(
    state: tauri::State<'_, AccountStore>,
    user_id: i64,
    privacy: String,
) -> Result<(), String> {
    let cookie = get_cookie(&state, user_id)?;
    api::roblox::set_follow_privacy(&cookie, &privacy).await
}

#[tauri::command]
async fn get_private_server_invite_privacy(
    state: tauri::State<'_, AccountStore>,
    user_id: i64,
) -> Result<String, String> {
    let cookie = get_cookie(&state, user_id)?;
    api::roblox::get_private_server_invite_privacy(&cookie).await
}

#[tauri::command]
async fn set_private_server_invite_privacy(
    state: tauri::State<'_, AccountStore>,
    user_id: i64,
    privacy: String,
) -> Result<(), String> {
    let cookie = get_cookie(&state, user_id)?;
    api::roblox::set_private_server_invite_privacy(&cookie, &privacy).await
}

#[tauri::command]
async fn set_avatar(
    state: tauri::State<'_, AccountStore>,
    user_id: i64,
    avatar_json: serde_json::Value,
) -> Result<Vec<i64>, String> {
    let cookie = get_cookie(&state, user_id)?;
    api::roblox::set_avatar(&cookie, avatar_json).await
}

#[tauri::command]
async fn get_outfits(target_user_id: i64) -> Result<Vec<api::roblox::OutfitInfo>, String> {
    api::roblox::get_outfits(target_user_id).await
}

#[tauri::command]
async fn get_outfit_details(outfit_id: i64) -> Result<serde_json::Value, String> {
    api::roblox::get_outfit_details(outfit_id).await
}

#[tauri::command]
async fn get_place_details(
    state: tauri::State<'_, AccountStore>,
    place_ids: Vec<i64>,
    user_id: Option<i64>,
) -> Result<Vec<api::roblox::PlaceDetails>, String> {
    let cookie = user_id.and_then(|id| get_cookie(&state, id).ok());
    api::roblox::get_place_details(&place_ids, cookie.as_deref()).await
}

#[tauri::command]
async fn get_servers(
    state: tauri::State<'_, AccountStore>,
    place_id: i64,
    server_type: String,
    cursor: Option<String>,
    user_id: Option<i64>,
) -> Result<api::roblox::ServersResponse, String> {
    let cookie = user_id.and_then(|id| get_cookie(&state, id).ok());
    api::roblox::get_servers(place_id, &server_type, cursor.as_deref(), cookie.as_deref()).await
}

#[tauri::command]
async fn join_game_instance(
    state: tauri::State<'_, AccountStore>,
    user_id: i64,
    place_id: i64,
    game_id: String,
    is_teleport: bool,
) -> Result<serde_json::Value, String> {
    let cookie = get_cookie(&state, user_id)?;
    api::roblox::join_game_instance(&cookie, place_id, &game_id, is_teleport).await
}

#[tauri::command]
async fn join_game(
    state: tauri::State<'_, AccountStore>,
    user_id: i64,
    place_id: i64,
) -> Result<serde_json::Value, String> {
    let cookie = get_cookie(&state, user_id)?;
    api::roblox::join_game(&cookie, place_id).await
}

#[tauri::command]
async fn search_games(security_token: Option<String>, keyword: String, start: i32) -> Result<serde_json::Value, String> {
    api::roblox::search_games(security_token.as_deref(), &keyword, start).await
}

#[tauri::command]
async fn get_universe_places(
    state: tauri::State<'_, AccountStore>,
    universe_id: i64,
    user_id: Option<i64>,
) -> Result<Vec<api::roblox::UniversePlace>, String> {
    let cookie = user_id.and_then(|id| get_cookie(&state, id).ok());
    api::roblox::get_universe_places(universe_id, cookie.as_deref()).await
}

#[tauri::command]
async fn parse_private_server_link_code(
    state: tauri::State<'_, AccountStore>,
    user_id: i64,
    place_id: i64,
    link_code: String,
) -> Result<String, String> {
    let cookie = get_cookie(&state, user_id)?;
    api::roblox::parse_private_server_link_code(&cookie, place_id, &link_code).await
}

#[tauri::command]
async fn join_group(
    state: tauri::State<'_, AccountStore>,
    user_id: i64,
    group_id: i64,
) -> Result<(), String> {
    let cookie = get_cookie(&state, user_id)?;
    api::roblox::join_group(&cookie, group_id).await
}

#[tauri::command]
async fn get_presence(user_ids: Vec<i64>) -> Result<Vec<api::roblox::UserPresence>, String> {
    api::roblox::get_presence(&user_ids).await
}

#[tauri::command]
async fn batch_thumbnails(
    requests: Vec<api::roblox::ThumbnailRequest>,
) -> Result<Vec<api::roblox::ThumbnailResponse>, String> {
    api::roblox::batch_thumbnails(requests).await
}

#[tauri::command]
async fn get_avatar_headshots(
    user_ids: Vec<i64>,
    size: String,
) -> Result<Vec<api::roblox::ThumbnailResponse>, String> {
    api::roblox::get_avatar_headshots(&user_ids, &size).await
}

#[tauri::command]
async fn get_asset_thumbnails(
    state: tauri::State<'_, AccountStore>,
    asset_ids: Vec<i64>,
    size: String,
    user_id: Option<i64>,
) -> Result<Vec<api::roblox::ThumbnailResponse>, String> {
    let cookie = user_id.and_then(|id| get_cookie(&state, id).ok());
    api::roblox::get_asset_thumbnails(&asset_ids, &size, cookie.as_deref()).await
}

#[tauri::command]
async fn get_asset_details(
    state: tauri::State<'_, AccountStore>,
    asset_id: i64,
    user_id: Option<i64>,
) -> Result<api::roblox::AssetDetails, String> {
    let cookie = user_id.and_then(|id| get_cookie(&state, id).ok());
    api::roblox::get_asset_details(asset_id, cookie.as_deref()).await
}

#[tauri::command]
async fn purchase_product(
    state: tauri::State<'_, AccountStore>,
    user_id: i64,
    product_id: i64,
    expected_price: i64,
    expected_seller_id: i64,
) -> Result<api::roblox::PurchaseResult, String> {
    let cookie = get_cookie(&state, user_id)?;
    api::roblox::purchase_product(&cookie, product_id, expected_price, expected_seller_id).await
}

#[tauri::command]
async fn change_password(
    state: tauri::State<'_, AccountStore>,
    user_id: i64,
    current_password: String,
    new_password: String,
) -> Result<(), String> {
    let cookie = get_cookie(&state, user_id)?;
    let new_cookie = api::auth::change_password(&cookie, &current_password, &new_password).await?;

    if let Some(new_cookie) = new_cookie {
        let accounts = state.get_all()?;
        if let Some(mut account) = accounts.into_iter().find(|a| a.user_id == user_id) {
            account.security_token = new_cookie;
            state.update(account)?;
        }
    }

    Ok(())
}

#[tauri::command]
async fn change_email(
    state: tauri::State<'_, AccountStore>,
    user_id: i64,
    password: String,
    new_email: String,
) -> Result<(), String> {
    let cookie = get_cookie(&state, user_id)?;
    api::auth::change_email(&cookie, &password, &new_email).await
}

#[tauri::command]
async fn set_display_name(
    state: tauri::State<'_, AccountStore>,
    user_id: i64,
    display_name: String,
) -> Result<(), String> {
    let cookie = get_cookie(&state, user_id)?;
    api::auth::set_display_name(&cookie, user_id, &display_name).await
}

#[tauri::command]
async fn quick_login_enter_code(
    state: tauri::State<'_, AccountStore>,
    user_id: i64,
    code: String,
) -> Result<serde_json::Value, String> {
    let cookie = get_cookie(&state, user_id)?;
    api::auth::quick_login_enter_code(&cookie, &code).await
}

#[tauri::command]
async fn quick_login_validate_code(
    state: tauri::State<'_, AccountStore>,
    user_id: i64,
    code: String,
) -> Result<(), String> {
    let cookie = get_cookie(&state, user_id)?;
    api::auth::quick_login_validate_code(&cookie, &code).await
}

#[tauri::command]
async fn batched_get_image(
    image_cache: tauri::State<'_, ImageCache>,
    target_id: i64,
    thumbnail_type: String,
    size: String,
    format: String,
) -> Result<Option<String>, String> {
    Ok(image_cache.get_image(target_id, &thumbnail_type, &size, &format).await)
}

#[tauri::command]
async fn batched_get_avatar_headshots(
    image_cache: tauri::State<'_, ImageCache>,
    user_ids: Vec<i64>,
    size: String,
) -> Result<Vec<api::batch::CachedThumbnail>, String> {
    let requests: Vec<(i64, String, String, String)> = user_ids
        .iter()
        .map(|&id| (id, "AvatarHeadShot".to_string(), size.clone(), "png".to_string()))
        .collect();

    let batch_results = image_cache.get_images_batch(requests).await;

    Ok(batch_results
        .into_iter()
        .map(|(target_id, url)| api::batch::CachedThumbnail {
            target_id,
            image_url: url,
            thumbnail_type: "AvatarHeadShot".to_string(),
        })
        .collect())
}

#[tauri::command]
async fn batched_get_game_icon(
    image_cache: tauri::State<'_, ImageCache>,
    account_store: tauri::State<'_, AccountStore>,
    place_id: i64,
    user_id: Option<i64>,
) -> Result<Option<String>, String> {
    let cookie = user_id.and_then(|id| get_cookie(&account_store, id).ok());
    Ok(image_cache.get_game_icon(place_id, cookie.as_deref()).await)
}

#[tauri::command]
async fn get_cached_thumbnail(
    image_cache: tauri::State<'_, ImageCache>,
    target_id: i64,
    thumbnail_type: String,
    size: String,
) -> Result<Option<String>, String> {
    Ok(image_cache.get_cached_url(target_id, &thumbnail_type, &size).await)
}

#[tauri::command]
async fn clear_image_cache(
    image_cache: tauri::State<'_, ImageCache>,
) -> Result<(), String> {
    image_cache.clear_cache().await;
    Ok(())
}

#[cfg(target_os = "windows")]
fn fps_unlock_target(settings: &SettingsStore) -> Option<u32> {
    if !settings.get_bool("General", "UnlockFPS") {
        return None;
    }
    settings
        .get_int("General", "MaxFPSValue")
        .filter(|fps| *fps > 0)
        .map(|fps| fps as u32)
}

#[cfg(target_os = "windows")]
fn patch_client_settings_for_launch(settings: &SettingsStore) {
    use platform::windows;

    let custom_settings = settings.get_string("General", "CustomClientSettings");
    let custom_settings = custom_settings.trim();

    // Legacy behavior: custom settings file overrides FPS unlock when valid.
    if !custom_settings.is_empty()
        && std::path::Path::new(custom_settings).exists()
        && windows::copy_custom_client_settings(custom_settings).is_ok()
    {
        return;
    }

    if let Some(fps) = fps_unlock_target(settings) {
        let _ = windows::apply_fps_unlock(fps);
    }
}

fn save_browser_tracker_id(
    state: &AccountStore,
    user_id: i64,
    browser_tracker_id: &str,
) -> Result<(), String> {
    let accounts = state.get_all()?;
    if let Some(mut account) = accounts.into_iter().find(|a| a.user_id == user_id) {
        account.browser_tracker_id = browser_tracker_id.to_string();
        state.update(account)?;
    }
    Ok(())
}

#[cfg(target_os = "windows")]
#[tauri::command]
async fn launch_roblox(
    state: tauri::State<'_, AccountStore>,
    settings: tauri::State<'_, SettingsStore>,
    user_id: i64,
    place_id: i64,
    job_id: String,
    launch_data: String,
    follow_user: bool,
    join_vip: bool,
    link_code: String,
    shuffle_job: bool,
) -> Result<(), String> {
    use platform::windows;

    let cookie = get_cookie(&state, user_id)?;
    let is_teleport = settings.get_bool("Developer", "IsTeleport");
    let use_old_join = settings.get_bool("Developer", "UseOldJoin");
    let auto_close_last_process = settings.get_bool("General", "AutoCloseLastProcess");

    let multi_rbx = settings.get_bool("General", "EnableMultiRbx");
    if multi_rbx {
        windows::enable_multi_roblox()?;
    }

    patch_client_settings_for_launch(&settings);

    let tracker = windows::tracker();
    if auto_close_last_process && tracker.get_pid(user_id).is_some() {
        tracker.kill_for_user(user_id);
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
    }

    let mut actual_job = job_id.clone();
    if shuffle_job && !follow_user && !join_vip {
        if let Ok(response) = api::roblox::get_servers(place_id, "Public", None, Some(&cookie)).await {
            if !response.data.is_empty() {
                let idx = (std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_nanos() as usize)
                    % response.data.len();
                actual_job = response.data[idx].id.clone();
            }
        }
    }

    let browser_tracker_id = windows::generate_browser_tracker_id();
    let ticket = api::auth::get_auth_ticket(&cookie).await?;

    let mut access_code = String::new();
    let mut final_link_code = link_code.clone();

    if join_vip && !link_code.is_empty() {
        if link_code.starts_with("http") {
            if let Some(code) = link_code.split("code=").nth(1) {
                final_link_code = code.split('&').next().unwrap_or(code).to_string();
            }
        }
        match api::roblox::parse_private_server_link_code(&cookie, place_id, &final_link_code).await {
            Ok(code) => access_code = code,
            Err(_) => {}
        }
    }

    let pids_before = windows::get_roblox_pids();

    let _ = save_browser_tracker_id(&state, user_id, &browser_tracker_id);

    if use_old_join {
        windows::launch_old_join(
            &ticket,
            place_id,
            &actual_job,
            &launch_data,
            follow_user,
            join_vip,
            &access_code,
            &final_link_code,
            is_teleport,
        )?;
    } else {
        let url = windows::build_launch_url(
            &ticket,
            place_id,
            &actual_job,
            &browser_tracker_id,
            &launch_data,
            follow_user,
            join_vip,
            &access_code,
            &final_link_code,
            is_teleport,
        );
        windows::launch_url(&url)?;
    }

    tokio::time::sleep(std::time::Duration::from_secs(3)).await;

    let pids_after = windows::get_roblox_pids();
    let new_pid = pids_after
        .iter()
        .find(|p| !pids_before.contains(p))
        .copied();

    if let Some(pid) = new_pid {
        tracker.track(user_id, pid, browser_tracker_id.clone());

        let accounts = state.get_all()?;
        if let Some(account) = accounts.iter().find(|a| a.user_id == user_id) {
            let x = account.fields.get("Window_Position_X").and_then(|v| v.parse::<i32>().ok());
            let y = account.fields.get("Window_Position_Y").and_then(|v| v.parse::<i32>().ok());
            let w = account.fields.get("Window_Width").and_then(|v| v.parse::<i32>().ok());
            let h = account.fields.get("Window_Height").and_then(|v| v.parse::<i32>().ok());

            if let (Some(x), Some(y), Some(w), Some(h)) = (x, y, w, h) {
                let target_pid = pid;
                tokio::spawn(async move {
                    for _ in 0..45 {
                        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                        if let Some(hwnd) = windows::find_main_window(target_pid) {
                            windows::set_window_position(hwnd, x, y, w, h);
                            break;
                        }
                    }
                });
            }
        }
    }

    Ok(())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
async fn launch_roblox(
    _user_id: i64,
    _place_id: i64,
    _job_id: String,
    _launch_data: String,
    _follow_user: bool,
    _join_vip: bool,
    _link_code: String,
    _shuffle_job: bool,
) -> Result<(), String> {
    Err("Launching is only supported on Windows".into())
}

#[cfg(target_os = "windows")]
#[tauri::command]
async fn launch_multiple(
    app: tauri::AppHandle,
    state: tauri::State<'_, AccountStore>,
    settings: tauri::State<'_, SettingsStore>,
    user_ids: Vec<i64>,
    place_id: i64,
    job_id: String,
    launch_data: String,
) -> Result<(), String> {
    use platform::windows;

    let delay = settings.get_int("General", "AccountJoinDelay").unwrap_or(8) as u64;
    let async_join = settings.get_bool("General", "AsyncJoin");
    let is_teleport = settings.get_bool("Developer", "IsTeleport");
    let use_old_join = settings.get_bool("Developer", "UseOldJoin");
    let auto_close_last_process = settings.get_bool("General", "AutoCloseLastProcess");
    let tracker = windows::tracker();
    tracker.reset_launch_cancelled();

    let accounts = state.get_all()?;

    for (i, &uid) in user_ids.iter().enumerate() {
        if tracker.is_launch_cancelled() {
            break;
        }

        let account = accounts.iter().find(|a| a.user_id == uid);
        let acct_place = account
            .and_then(|a| a.fields.get("SavedPlaceId"))
            .and_then(|v| v.parse::<i64>().ok())
            .unwrap_or(place_id);
        let acct_job = account
            .and_then(|a| a.fields.get("SavedJobId"))
            .map(|v| v.clone())
            .unwrap_or_else(|| job_id.clone());

        let _ = app.emit("launch-progress", serde_json::json!({
            "userId": uid,
            "index": i,
            "total": user_ids.len(),
        }));

        let cookie = match get_cookie(&state, uid) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let multi_rbx = settings.get_bool("General", "EnableMultiRbx");
        if multi_rbx {
            let _ = windows::enable_multi_roblox();
        }

        patch_client_settings_for_launch(&settings);

        if auto_close_last_process && tracker.get_pid(uid).is_some() {
            tracker.kill_for_user(uid);
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        }

        let browser_tracker_id = windows::generate_browser_tracker_id();
        let _ = save_browser_tracker_id(&state, uid, &browser_tracker_id);
        let ticket = match api::auth::get_auth_ticket(&cookie).await {
            Ok(t) => t,
            Err(_) => continue,
        };

        let pids_before = windows::get_roblox_pids();

        let launch_result = if use_old_join {
            windows::launch_old_join(
                &ticket,
                acct_place,
                &acct_job,
                &launch_data,
                false,
                false,
                "",
                "",
                is_teleport,
            )
        } else {
            let url = windows::build_launch_url(
                &ticket,
                acct_place,
                &acct_job,
                &browser_tracker_id,
                &launch_data,
                false,
                false,
                "",
                "",
                is_teleport,
            );
            windows::launch_url(&url)
        };

        if launch_result.is_err() {
            continue;
        }

        tokio::time::sleep(std::time::Duration::from_secs(3)).await;

        let pids_after = windows::get_roblox_pids();
        if let Some(&pid) = pids_after.iter().find(|p| !pids_before.contains(p)) {
            tracker.track(uid, pid, browser_tracker_id);
        }

        if i < user_ids.len() - 1 {
            if async_join {
                tracker.reset_next_account();
                let deadline = std::time::Instant::now() + std::time::Duration::from_secs(120);
                while !tracker.is_next_account() && !tracker.is_launch_cancelled() {
                    if std::time::Instant::now() > deadline {
                        break;
                    }
                    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                }
            } else {
                tokio::time::sleep(std::time::Duration::from_secs(delay)).await;
            }
        }
    }

    let _ = app.emit("launch-complete", serde_json::json!({}));
    Ok(())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
async fn launch_multiple(
    _user_ids: Vec<i64>,
    _place_id: i64,
    _job_id: String,
    _launch_data: String,
) -> Result<(), String> {
    Err("Launching is only supported on Windows".into())
}

#[tauri::command]
fn cancel_launch() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        platform::windows::tracker().cancel_launch();
    }
    Ok(())
}

#[tauri::command]
fn next_account() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        platform::windows::tracker().signal_next_account();
    }
    Ok(())
}

#[tauri::command]
fn cmd_kill_roblox(user_id: i64) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        Ok(platform::windows::tracker().kill_for_user(user_id))
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = user_id;
        Err("Not supported on this platform".into())
    }
}

#[tauri::command]
fn cmd_kill_all_roblox() -> Result<u32, String> {
    #[cfg(target_os = "windows")]
    {
        let killed = platform::windows::kill_all_roblox();
        let tracker = platform::windows::tracker();
        let all = tracker.get_all();
        for p in all {
            tracker.untrack(p.user_id);
        }
        Ok(killed)
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Not supported on this platform".into())
    }
}

#[derive(serde::Serialize)]
struct RunningInstance {
    pid: u32,
    user_id: i64,
    browser_tracker_id: String,
}

#[tauri::command]
fn get_running_instances() -> Result<Vec<RunningInstance>, String> {
    #[cfg(target_os = "windows")]
    {
        Ok(platform::windows::tracker()
            .get_all()
            .into_iter()
            .map(|p| RunningInstance {
                pid: p.pid,
                user_id: p.user_id,
                browser_tracker_id: p.browser_tracker_id,
            })
            .collect())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(Vec::new())
    }
}

#[tauri::command]
fn cmd_enable_multi_roblox() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        platform::windows::enable_multi_roblox()
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Not supported on this platform".into())
    }
}

#[tauri::command]
fn cmd_disable_multi_roblox() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        platform::windows::disable_multi_roblox()
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(())
    }
}

#[tauri::command]
fn cmd_get_roblox_path() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        platform::windows::get_roblox_path()
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Not supported on this platform".into())
    }
}

#[tauri::command]
fn cmd_apply_fps_unlock(max_fps: u32) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        platform::windows::apply_fps_unlock(max_fps)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = max_fps;
        Err("Not supported on this platform".into())
    }
}

#[cfg(target_os = "windows")]
#[tauri::command]
async fn start_watcher(
    app: tauri::AppHandle,
    settings: tauri::State<'_, SettingsStore>,
) -> Result<(), String> {
    use platform::windows;

    let tracker = windows::tracker();
    if tracker.is_watcher_active() {
        return Ok(());
    }
    tracker.set_watcher_active(true);

    let interval = settings.get_int("Watcher", "ScanInterval").unwrap_or(6) as u64;
    let read_interval_ms = settings
        .get_int("Watcher", "ReadInterval")
        .unwrap_or(250)
        .max(50) as u64;
    let mem_enabled = settings.get_bool("Watcher", "CloseRbxMemory");
    let mem_limit = settings.get_int("Watcher", "MemoryLowValue").unwrap_or(200) as u64;
    let title_enabled = settings.get_bool("Watcher", "CloseRbxWindowTitle");
    let expected_title = settings.get_string("Watcher", "ExpectedWindowTitle");
    let save_positions = settings.get_bool("Watcher", "SaveWindowPositions");
    let exit_if_no_connection = settings.get_bool("Watcher", "ExitIfNoConnection");
    let no_connection_timeout = settings
        .get_int("Watcher", "NoConnectionTimeout")
        .unwrap_or(60)
        .max(1) as u64;
    let exit_on_beta = settings.get_bool("Watcher", "ExitOnBeta");

    let app_handle = app.clone();

    tokio::spawn(async move {
        let mut disconnected_since: HashMap<i64, std::time::Instant> = HashMap::new();
        while tracker.is_watcher_active() {
            let sleep_ms = (interval * 1000).max(read_interval_ms);
            tokio::time::sleep(std::time::Duration::from_millis(sleep_ms)).await;

            if !tracker.is_watcher_active() {
                break;
            }

            let dead_users = tracker.cleanup_dead_processes();
            for uid in &dead_users {
                let _ = app_handle.emit("roblox-process-died", serde_json::json!({
                    "userId": uid,
                }));
            }

            let instances = tracker.get_all();
            let fg_hwnd = windows::get_foreground_hwnd();

            for inst in &instances {
                if let Some(hwnd) = windows::find_main_window(inst.pid) {
                    if hwnd == fg_hwnd {
                        continue;
                    }

                    if mem_enabled {
                        if let Some(mem) = windows::get_process_memory_mb(inst.pid) {
                            if mem < mem_limit {
                                tracker.kill_for_user(inst.user_id);
                                let _ = app_handle.emit("roblox-low-memory", serde_json::json!({
                                    "userId": inst.user_id,
                                    "memoryMb": mem,
                                }));
                            }
                        }
                    }

                    if title_enabled && !expected_title.is_empty() {
                        let title = windows::get_window_title(hwnd);
                        if !title.is_empty() && title != expected_title {
                            tracker.kill_for_user(inst.user_id);
                            let _ = app_handle.emit("roblox-title-mismatch", serde_json::json!({
                                "userId": inst.user_id,
                                "title": title,
                                "expected": expected_title,
                            }));
                        }
                    }

                    if exit_on_beta {
                        let title = windows::get_window_title(hwnd);
                        if title.to_lowercase().contains("beta") {
                            tracker.kill_for_user(inst.user_id);
                            let _ = app_handle.emit("roblox-beta-detected", serde_json::json!({
                                "userId": inst.user_id,
                                "title": title,
                            }));
                        }
                    }

                    if exit_if_no_connection {
                        let title = windows::get_window_title(hwnd).to_lowercase();
                        let looks_disconnected = title.contains("disconnected")
                            || title.contains("connection error")
                            || title.contains("lost connection")
                            || title.contains("no connection");
                        if looks_disconnected {
                            let since = disconnected_since
                                .entry(inst.user_id)
                                .or_insert_with(std::time::Instant::now);
                            if since.elapsed().as_secs() >= no_connection_timeout {
                                tracker.kill_for_user(inst.user_id);
                                let _ = app_handle.emit("roblox-no-connection", serde_json::json!({
                                    "userId": inst.user_id,
                                    "title": title,
                                    "timeout": no_connection_timeout,
                                }));
                                disconnected_since.remove(&inst.user_id);
                            }
                        } else {
                            disconnected_since.remove(&inst.user_id);
                        }
                    }

                    if save_positions {
                        if let Some((x, y, w, h)) = windows::get_window_position(hwnd) {
                            let store = app_handle.state::<AccountStore>();
                            if let Ok(accounts) = store.get_all() {
                                if let Some(mut account) = accounts.into_iter().find(|a| a.user_id == inst.user_id) {
                                    account.fields.insert("Window_Position_X".into(), x.to_string());
                                    account.fields.insert("Window_Position_Y".into(), y.to_string());
                                    account.fields.insert("Window_Width".into(), w.to_string());
                                    account.fields.insert("Window_Height".into(), h.to_string());
                                    let _ = store.update(account);
                                }
                            }
                        }
                    }
                }
            }
        }
    });

    Ok(())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
async fn start_watcher() -> Result<(), String> {
    Err("Watcher is only supported on Windows".into())
}

#[tauri::command]
fn stop_watcher() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        platform::windows::tracker().set_watcher_active(false);
    }
    Ok(())
}

#[tauri::command]
async fn start_web_server(app: tauri::AppHandle) -> Result<u16, String> {
    let accounts: &'static AccountStore = unsafe {
        &*(app.state::<AccountStore>().inner() as *const AccountStore)
    };
    let settings: &'static SettingsStore = unsafe {
        &*(app.state::<SettingsStore>().inner() as *const SettingsStore)
    };
    api::server::start(accounts, settings).await
}

#[tauri::command]
fn stop_web_server() -> Result<(), String> {
    api::server::stop()
}

#[tauri::command]
fn get_web_server_status() -> Result<api::server::WebServerStatus, String> {
    Ok(api::server::WebServerStatus {
        running: api::server::is_running(),
        port: api::server::get_port(),
    })
}

#[tauri::command]
async fn start_nexus_server(app: tauri::AppHandle, settings: tauri::State<'_, SettingsStore>) -> Result<u16, String> {
    let port = settings.get_int("AccountControl", "NexusPort").unwrap_or(5242) as u16;
    let allow_external = settings.get_bool("AccountControl", "AllowExternalConnections");
    nexus::websocket::nexus().start(port, allow_external, app).await
}

#[tauri::command]
fn stop_nexus_server() -> Result<(), String> {
    nexus::websocket::nexus().stop();
    Ok(())
}

#[tauri::command]
fn get_nexus_status() -> Result<nexus::websocket::NexusStatus, String> {
    Ok(nexus::websocket::nexus().get_status())
}

#[tauri::command]
fn get_nexus_accounts() -> Result<Vec<nexus::websocket::AccountView>, String> {
    Ok(nexus::websocket::nexus().get_accounts())
}

#[tauri::command]
fn add_nexus_account(username: String) -> Result<(), String> {
    nexus::websocket::nexus().add_account(&username)
}

#[tauri::command]
fn remove_nexus_accounts(usernames: Vec<String>) -> Result<(), String> {
    nexus::websocket::nexus().remove_accounts(&usernames);
    Ok(())
}

#[tauri::command]
fn update_nexus_account(account: nexus::websocket::AccountView) -> Result<(), String> {
    nexus::websocket::nexus().update_account(account);
    Ok(())
}

#[tauri::command]
fn nexus_send_command(message: String) -> Result<(), String> {
    nexus::websocket::nexus().send_command(&message);
    Ok(())
}

#[tauri::command]
fn nexus_send_to_all(message: String) -> Result<(), String> {
    nexus::websocket::nexus().send_to_all(&message);
    Ok(())
}

#[tauri::command]
fn get_nexus_log() -> Result<Vec<String>, String> {
    Ok(nexus::websocket::nexus().get_log())
}

#[tauri::command]
fn clear_nexus_log() -> Result<(), String> {
    nexus::websocket::nexus().clear_log();
    Ok(())
}

#[tauri::command]
fn get_nexus_elements() -> Result<Vec<nexus::websocket::CustomElement>, String> {
    Ok(nexus::websocket::nexus().get_elements())
}

#[tauri::command]
fn set_nexus_element_value(name: String, value: String) -> Result<(), String> {
    nexus::websocket::nexus().set_element_value(&name, &value);
    Ok(())
}

#[tauri::command]
fn export_nexus_lua() -> Result<String, String> {
    let out_path = std::env::current_dir()
        .map_err(|e| format!("Failed to read current directory: {}", e))?
        .join("Nexus.lua");
    let content = include_str!("../assets/Nexus.lua");
    std::fs::write(&out_path, content)
        .map_err(|e| format!("Failed to write Nexus.lua: {}", e))?;
    Ok(out_path.to_string_lossy().into_owned())
}

fn get_cookie(state: &AccountStore, user_id: i64) -> Result<String, String> {
    let accounts = state.get_all()?;
    accounts
        .iter()
        .find(|a| a.user_id == user_id)
        .map(|a| a.security_token.clone())
        .ok_or_else(|| format!("Account {} not found", user_id))
}

pub fn run() {
    crypto::init();

    let account_store = AccountStore::new(get_account_data_path());

    match account_store.needs_password() {
        Ok(true) => eprintln!("Encrypted account file detected, password required"),
        Ok(false) => {
            if let Err(e) = account_store.load() {
                eprintln!("Warning: Failed to load accounts: {}", e);
            }
        }
        Err(e) => eprintln!("Warning: Failed to check encryption: {}", e),
    }

    let settings_store = SettingsStore::new(get_settings_path());
    let theme_store = ThemeStore::new(get_theme_path());
    let image_cache = ImageCache::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(account_store)
        .manage(settings_store)
        .manage(theme_store)
        .manage(image_cache)
        .setup(|app| {
            let show = MenuItemBuilder::with_id("show", "Show").build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
            let menu = MenuBuilder::new(app).items(&[&show, &quit]).build()?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Roblox Account Manager")
                .menu(&menu)
                .on_menu_event(|app: &AppHandle<Wry>, event: MenuEvent| {
                    match event.id().as_ref() {
                        "show" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.unminimize();
                                let _ = w.set_focus();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray: &TrayIcon<Wry>, event: TrayIconEvent| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.unminimize();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            let settings = app.state::<SettingsStore>();
            if settings.get_bool("AccountControl", "StartOnLaunch") {
                let handle = app.handle().clone();
                let port = settings.get_int("AccountControl", "NexusPort").unwrap_or(5242) as u16;
                let allow_external = settings.get_bool("AccountControl", "AllowExternalConnections");
                tauri::async_runtime::spawn(async move {
                    match nexus::websocket::nexus().start(port, allow_external, handle).await {
                        Ok(port) => eprintln!("Nexus server started on port {}", port),
                        Err(e) => eprintln!("Failed to start Nexus server: {}", e),
                    }
                });
            }
            if settings.get_bool("Developer", "EnableWebServer") {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    let accounts: &'static AccountStore = unsafe {
                        &*(handle.state::<AccountStore>().inner() as *const AccountStore)
                    };
                    let settings: &'static SettingsStore = unsafe {
                        &*(handle.state::<SettingsStore>().inner() as *const SettingsStore)
                    };
                    match api::server::start(accounts, settings).await {
                        Ok(port) => eprintln!("Web server started on port {}", port),
                        Err(e) => eprintln!("Failed to start web server: {}", e),
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            data::accounts::get_accounts,
            data::accounts::save_accounts,
            data::accounts::add_account,
            data::accounts::remove_account,
            data::accounts::update_account,
            data::accounts::unlock_accounts,
            data::accounts::is_accounts_encrypted,
            data::accounts::needs_password,
            data::accounts::set_encryption_password,
            data::accounts::reorder_accounts,
            data::settings::get_all_settings,
            data::settings::get_setting,
            data::settings::update_setting,
            data::settings::get_theme,
            data::settings::update_theme,
            test_auth,
            validate_cookie,
            get_csrf_token,
            get_auth_ticket,
            check_pin,
            unlock_pin,
            refresh_cookie,
            get_robux,
            get_user_info,
            lookup_user,
            send_friend_request,
            block_user,
            unblock_user,
            get_blocked_users,
            unblock_all_users,
            set_follow_privacy,
            get_private_server_invite_privacy,
            set_private_server_invite_privacy,
            set_avatar,
            get_outfits,
            get_outfit_details,
            get_place_details,
            get_servers,
            join_game_instance,
            join_game,
            search_games,
            get_universe_places,
            parse_private_server_link_code,
            join_group,
            get_presence,
            batch_thumbnails,
            get_avatar_headshots,
            get_asset_thumbnails,
            get_asset_details,
            purchase_product,
            change_password,
            change_email,
            set_display_name,
            quick_login_enter_code,
            quick_login_validate_code,
            batched_get_image,
            batched_get_avatar_headshots,
            batched_get_game_icon,
            get_cached_thumbnail,
            clear_image_cache,
            launch_roblox,
            launch_multiple,
            cancel_launch,
            next_account,
            cmd_kill_roblox,
            cmd_kill_all_roblox,
            get_running_instances,
            cmd_enable_multi_roblox,
            cmd_disable_multi_roblox,
            cmd_get_roblox_path,
            cmd_apply_fps_unlock,
            start_watcher,
            stop_watcher,
            browser::open_login_browser,
            browser::extract_browser_cookie,
            browser::close_login_browser,
            browser::open_account_browser,
            start_web_server,
            stop_web_server,
            get_web_server_status,
            start_nexus_server,
            stop_nexus_server,
            get_nexus_status,
            get_nexus_accounts,
            add_nexus_account,
            remove_nexus_accounts,
            update_nexus_account,
            nexus_send_command,
            nexus_send_to_all,
            get_nexus_log,
            clear_nexus_log,
            get_nexus_elements,
            set_nexus_element_value,
            export_nexus_lua,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
