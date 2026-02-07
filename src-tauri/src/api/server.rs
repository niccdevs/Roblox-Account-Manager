use std::net::SocketAddr;
use axum::{
    Router,
    body::Body,
    extract::{Extension, Query, Request},
    middleware::{self, Next},
    response::Response,
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use tokio::sync::watch;

use crate::api::{auth, roblox};
use crate::data::accounts::AccountStore;
use crate::data::settings::SettingsStore;

static SERVER_STATE: std::sync::LazyLock<std::sync::Mutex<Option<ServerHandle>>> =
    std::sync::LazyLock::new(|| std::sync::Mutex::new(None));

struct ServerHandle {
    shutdown_tx: watch::Sender<bool>,
    port: u16,
}

#[derive(Clone)]
struct AppState {
    accounts: &'static AccountStore,
    settings: &'static SettingsStore,
}

#[cfg(target_os = "windows")]
fn patch_client_settings_for_launch(settings: &SettingsStore) {
    use crate::platform::windows;

    let custom_settings = settings.get_string("General", "CustomClientSettings");
    let custom_settings = custom_settings.trim();

    if !custom_settings.is_empty()
        && std::path::Path::new(custom_settings).exists()
        && windows::copy_custom_client_settings(custom_settings).is_ok()
    {
        return;
    }

    if settings.get_bool("General", "UnlockFPS") {
        let max_fps = settings.get_int("General", "MaxFPSValue").unwrap_or(120);
        if max_fps > 0 {
            let _ = windows::apply_fps_unlock(max_fps as u32);
        }
    }
}

#[derive(Debug, Deserialize)]
struct AccountQuery {
    #[serde(alias = "account", alias = "Account")]
    account: Option<String>,
    #[serde(alias = "password", alias = "Password")]
    password: Option<String>,
    #[serde(alias = "placeId", alias = "PlaceId", alias = "placeid")]
    place_id: Option<String>,
    #[serde(alias = "jobId", alias = "JobId", alias = "jobid")]
    job_id: Option<String>,
    #[serde(alias = "userId", alias = "UserId", alias = "userid")]
    user_id: Option<String>,
    #[serde(alias = "field", alias = "Field")]
    field: Option<String>,
    #[serde(alias = "value", alias = "Value")]
    value: Option<String>,
    #[serde(alias = "cookie", alias = "Cookie")]
    cookie: Option<String>,
    #[serde(alias = "group", alias = "Group")]
    group: Option<String>,
    #[serde(alias = "username", alias = "Username")]
    username: Option<String>,
    #[serde(alias = "followUser", alias = "FollowUser")]
    follow_user: Option<String>,
    #[serde(alias = "joinVip", alias = "JoinVIP")]
    join_vip: Option<String>,
    #[serde(alias = "includeCookies", alias = "IncludeCookies")]
    include_cookies: Option<String>,
}

fn reply(status: u16, message: &str, v2: bool) -> Response {
    let body = if v2 {
        serde_json::json!({
            "Success": status < 300,
            "Message": message,
        })
        .to_string()
    } else {
        message.to_string()
    };

    let mut response = Response::builder().status(status);

    if v2 {
        response = response.header("content-type", "application/json; charset=utf-8");
    } else {
        response = response.header("content-type", "text/plain; charset=utf-8");
        if status > 299 {
            response = response.header("ws-error", message);
        }
    }

    response.body(Body::from(body)).unwrap()
}

fn find_account(accounts: &[crate::data::accounts::Account], identifier: &str) -> Option<crate::data::accounts::Account> {
    accounts
        .iter()
        .find(|a| a.username == identifier || a.user_id.to_string() == identifier)
        .cloned()
}

async fn external_check(
    Extension(state): Extension<AppState>,
    req: Request,
    next: Next,
) -> Response {
    let path = req.uri().path().to_string();
    let is_v2 = path.starts_with("/v2/");
    let is_running = path.eq_ignore_ascii_case("/Running") || path.eq_ignore_ascii_case("/v2/Running");

    let allow_external = state.settings.get_bool("WebServer", "AllowExternalConnections");

    if !allow_external {
        if let Some(addr) = req.extensions().get::<axum::extract::ConnectInfo<SocketAddr>>() {
            let ip = addr.ip();
            if !ip.is_loopback() {
                return reply(403, "External connections are not allowed", is_v2);
            }
        }
    }

    if !is_running && state.settings.get_bool("WebServer", "EveryRequestRequiresPassword") {
        let ws_password = state.settings.get_string("WebServer", "Password");
        let provided_password = req
            .uri()
            .query()
            .and_then(|query| {
                query.split('&').find_map(|entry| {
                    let mut parts = entry.splitn(2, '=');
                    let key = parts.next().unwrap_or_default();
                    if !key.eq_ignore_ascii_case("password") {
                        return None;
                    }
                    let raw = parts.next().unwrap_or_default().replace('+', " ");
                    Some(urlencoding::decode(&raw).map(|v| v.into_owned()).unwrap_or(raw))
                })
            });

        if ws_password.len() < 6 || provided_password.as_deref() != Some(ws_password.as_str()) {
            return reply(
                401,
                "Invalid Password, make sure your password contains 6 or more characters",
                is_v2,
            );
        }
    }

    next.run(req).await
}

async fn handle_running(Extension(_state): Extension<AppState>, v2: bool) -> Response {
    if v2 {
        reply(200, "Roblox Account Manager is running", true)
    } else {
        reply(200, "true", false)
    }
}

async fn handle_get_accounts(
    Extension(state): Extension<AppState>,
    Query(params): Query<AccountQuery>,
    v2: bool,
) -> Response {
    if !state.settings.get_bool("WebServer", "AllowGetAccounts") {
        return reply(401, "AllowGetAccounts is disabled", v2);
    }

    if !check_password(&state, &params.password) {
        return reply(401, "Invalid password", v2);
    }

    let accounts = match state.accounts.get_all() {
        Ok(a) => a,
        Err(e) => return reply(500, &e, v2),
    };

    let filtered: Vec<_> = if let Some(ref group) = params.group {
        accounts.into_iter().filter(|a| &a.group == group).collect()
    } else {
        accounts
    };

    let names: Vec<String> = filtered.iter().map(|a| a.username.clone()).collect();
    reply(200, &names.join(","), v2)
}

async fn handle_get_accounts_json(
    Extension(state): Extension<AppState>,
    Query(params): Query<AccountQuery>,
    v2: bool,
) -> Response {
    if !state.settings.get_bool("WebServer", "AllowGetAccounts") {
        return reply(401, "AllowGetAccounts is disabled", v2);
    }

    if !check_password(&state, &params.password) {
        return reply(401, "Invalid password", v2);
    }

    let include_cookies = params
        .include_cookies
        .as_deref()
        .map(|v| v.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
        && state.settings.get_bool("WebServer", "AllowGetCookie")
        && check_password(&state, &params.password);

    let accounts = match state.accounts.get_all() {
        Ok(a) => a,
        Err(e) => return reply(500, &e, v2),
    };

    let filtered: Vec<_> = if let Some(ref group) = params.group {
        accounts.into_iter().filter(|a| &a.group == group).collect()
    } else {
        accounts
    };

    let json_accounts: Vec<serde_json::Value> = filtered
        .iter()
        .map(|a| {
            let mut obj = serde_json::json!({
                "Username": a.username,
                "UserID": a.user_id,
                "Alias": a.alias,
                "Description": a.description,
                "Group": a.group,
                "Fields": a.fields,
            });

            if include_cookies {
                obj["Cookie"] = serde_json::Value::String(a.security_token.clone());
            }

            obj
        })
        .collect();

    let body = serde_json::to_string(&json_accounts).unwrap_or_else(|_| "[]".to_string());

    if v2 {
        let wrapper = serde_json::json!({
            "Success": true,
            "Message": json_accounts,
        });
        Response::builder()
            .status(200)
            .header("content-type", "application/json; charset=utf-8")
            .body(Body::from(wrapper.to_string()))
            .unwrap()
    } else {
        Response::builder()
            .status(200)
            .header("content-type", "application/json; charset=utf-8")
            .body(Body::from(body))
            .unwrap()
    }
}

async fn handle_import_cookie(
    Extension(state): Extension<AppState>,
    Query(params): Query<AccountQuery>,
    v2: bool,
) -> Response {
    let cookie = match params.cookie {
        Some(ref c) if !c.is_empty() => c,
        _ => return reply(400, "Missing Cookie parameter", v2),
    };

    match auth::validate_cookie(cookie).await {
        Ok(info) => {
            let account = crate::data::accounts::Account::new(
                cookie.clone(),
                info.name.clone(),
                info.user_id,
            );
            match state.accounts.add(account) {
                Ok(_) => reply(200, &format!("Imported {}", info.name), v2),
                Err(e) => reply(500, &format!("Failed to save: {}", e), v2),
            }
        }
        Err(e) => reply(400, &format!("Invalid cookie: {}", e), v2),
    }
}

async fn handle_get_cookie(
    Extension(state): Extension<AppState>,
    Query(params): Query<AccountQuery>,
    v2: bool,
) -> Response {
    if !state.settings.get_bool("WebServer", "AllowGetCookie") {
        return reply(401, "AllowGetCookie is disabled", v2);
    }

    if !check_password(&state, &params.password) {
        return reply(401, "Invalid password", v2);
    }

    let identifier = match params.account {
        Some(ref a) if !a.is_empty() => a,
        _ => return reply(400, "Missing Account parameter", v2),
    };

    let accounts = match state.accounts.get_all() {
        Ok(a) => a,
        Err(e) => return reply(500, &e, v2),
    };

    match find_account(&accounts, identifier) {
        Some(account) => reply(200, &account.security_token, v2),
        None => reply(404, "Account not found", v2),
    }
}

async fn handle_get_csrf_token(
    Extension(state): Extension<AppState>,
    Query(params): Query<AccountQuery>,
    v2: bool,
) -> Response {
    let identifier = match params.account {
        Some(ref a) if !a.is_empty() => a,
        _ => return reply(400, "Missing Account parameter", v2),
    };

    let accounts = match state.accounts.get_all() {
        Ok(a) => a,
        Err(e) => return reply(500, &e, v2),
    };

    let account = match find_account(&accounts, identifier) {
        Some(a) => a,
        None => return reply(404, "Account not found", v2),
    };

    match auth::get_csrf_token(&account.security_token).await {
        Ok(token) => reply(200, &token, v2),
        Err(e) => reply(400, &e, v2),
    }
}

async fn handle_launch_account(
    Extension(state): Extension<AppState>,
    Query(params): Query<AccountQuery>,
    v2: bool,
) -> Response {
    if !state.settings.get_bool("WebServer", "AllowLaunchAccount") {
        return reply(401, "AllowLaunchAccount is disabled", v2);
    }

    if !check_password(&state, &params.password) {
        return reply(401, "Invalid password", v2);
    }

    let identifier = match params.account {
        Some(ref a) if !a.is_empty() => a,
        _ => return reply(400, "Missing Account parameter", v2),
    };

    let place_id: i64 = match params.place_id.as_deref().and_then(|v| v.parse().ok()) {
        Some(id) => id,
        None => return reply(400, "Missing or invalid PlaceId parameter", v2),
    };

    let job_id = params.job_id.as_deref().unwrap_or("");
    let follow_user = params.follow_user.as_deref().map(|v| v.eq_ignore_ascii_case("true")).unwrap_or(false);
    let join_vip = params.join_vip.as_deref().map(|v| v.eq_ignore_ascii_case("true")).unwrap_or(false);

    let accounts = match state.accounts.get_all() {
        Ok(a) => a,
        Err(e) => return reply(500, &e, v2),
    };

    let account = match find_account(&accounts, identifier) {
        Some(a) => a,
        None => return reply(404, "Account not found", v2),
    };

    #[cfg(target_os = "windows")]
    {
        use crate::platform::windows;

        patch_client_settings_for_launch(state.settings);
        let is_teleport = state.settings.get_bool("Developer", "IsTeleport");
        let use_old_join = state.settings.get_bool("Developer", "UseOldJoin");
        let auto_close_last_process = state.settings.get_bool("General", "AutoCloseLastProcess");
        let multi_rbx = state.settings.get_bool("General", "EnableMultiRbx");

        if multi_rbx {
            match windows::enable_multi_roblox() {
                Ok(true) => {}
                Ok(false) => {
                    return reply(500, "Failed to enable Multi Roblox. Close all Roblox processes and try again.", v2);
                }
                Err(e) => return reply(500, &e, v2),
            }
        } else {
            let _ = windows::disable_multi_roblox();
        }

        let tracker = windows::tracker();
        if auto_close_last_process && tracker.get_pid(account.user_id).is_some() {
            tracker.kill_for_user(account.user_id);
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        }

        let browser_tracker_id = windows::generate_browser_tracker_id();
        let ticket = match auth::get_auth_ticket(&account.security_token).await {
            Ok(t) => t,
            Err(e) => return reply(400, &format!("Failed to get auth ticket: {}", e), v2),
        };

        let pids_before = windows::get_roblox_pids();

        let mut access_code = if join_vip {
            job_id.to_string()
        } else {
            String::new()
        };
        let mut link_code = String::new();

        if join_vip && !job_id.is_empty() {
            let mut extracted = String::new();

            if let Some(code) = job_id.split("privateServerLinkCode=").nth(1) {
                extracted = code.split('&').next().unwrap_or(code).to_string();
            } else if let Some(code) = job_id.split("linkCode=").nth(1) {
                extracted = code.split('&').next().unwrap_or(code).to_string();
            } else if let Some(code) = job_id.split("code=").nth(1) {
                extracted = code.split('&').next().unwrap_or(code).to_string();
            }

            if !extracted.is_empty() {
                link_code = extracted;
                if let Ok(code) = roblox::parse_private_server_link_code(
                    &account.security_token,
                    place_id,
                    &link_code,
                )
                .await
                {
                    access_code = code;
                }
            }
        }

        let launch_result = if use_old_join {
            windows::launch_old_join(
                &ticket,
                place_id,
                job_id,
                "",
                follow_user,
                join_vip,
                &access_code,
                &link_code,
                is_teleport,
            )
        } else {
            let url = windows::build_launch_url(
                &ticket,
                place_id,
                job_id,
                &browser_tracker_id,
                "",
                follow_user,
                join_vip,
                &access_code,
                &link_code,
                is_teleport,
            );
            windows::launch_url(&url)
        };

        if let Err(e) = launch_result {
            return reply(500, &format!("Failed to launch: {}", e), v2);
        }

        tokio::time::sleep(std::time::Duration::from_secs(3)).await;

        let pids_after = windows::get_roblox_pids();
        if let Some(&pid) = pids_after.iter().find(|p| !pids_before.contains(p)) {
            tracker.track(account.user_id, pid, browser_tracker_id);
        }

        reply(200, &format!("Launched {} to {}", account.username, place_id), v2)
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (place_id, job_id, follow_user, join_vip, account);
        reply(500, "Launching is only supported on Windows", v2)
    }
}

async fn handle_follow_user(
    Extension(state): Extension<AppState>,
    Query(params): Query<AccountQuery>,
    v2: bool,
) -> Response {
    if !state.settings.get_bool("WebServer", "AllowLaunchAccount") {
        return reply(401, "AllowLaunchAccount is disabled", v2);
    }

    if !check_password(&state, &params.password) {
        return reply(401, "Invalid password", v2);
    }

    let identifier = match params.account {
        Some(ref a) if !a.is_empty() => a,
        _ => return reply(400, "Missing Account parameter", v2),
    };

    let target_username = match params.username {
        Some(ref u) if !u.is_empty() => u.clone(),
        _ => return reply(400, "Missing Username parameter", v2),
    };

    let accounts = match state.accounts.get_all() {
        Ok(a) => a,
        Err(e) => return reply(500, &e, v2),
    };

    let account = match find_account(&accounts, identifier) {
        Some(a) => a,
        None => return reply(404, "Account not found", v2),
    };

    let target = match roblox::get_user_id(None, &target_username).await {
        Ok(u) => u,
        Err(e) => return reply(400, &e, v2),
    };

    #[cfg(target_os = "windows")]
    {
        use crate::platform::windows;

        patch_client_settings_for_launch(state.settings);
        let is_teleport = state.settings.get_bool("Developer", "IsTeleport");
        let use_old_join = state.settings.get_bool("Developer", "UseOldJoin");
        let auto_close_last_process = state.settings.get_bool("General", "AutoCloseLastProcess");
        let multi_rbx = state.settings.get_bool("General", "EnableMultiRbx");

        if multi_rbx {
            match windows::enable_multi_roblox() {
                Ok(true) => {}
                Ok(false) => {
                    return reply(500, "Failed to enable Multi Roblox. Close all Roblox processes and try again.", v2);
                }
                Err(e) => return reply(500, &e, v2),
            }
        } else {
            let _ = windows::disable_multi_roblox();
        }

        let tracker = windows::tracker();
        if auto_close_last_process && tracker.get_pid(account.user_id).is_some() {
            tracker.kill_for_user(account.user_id);
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        }

        let browser_tracker_id = windows::generate_browser_tracker_id();
        let ticket = match auth::get_auth_ticket(&account.security_token).await {
            Ok(t) => t,
            Err(e) => return reply(400, &format!("Failed to get auth ticket: {}", e), v2),
        };

        let pids_before = windows::get_roblox_pids();

        let launch_result = if use_old_join {
            windows::launch_old_join(
                &ticket,
                target.id,
                "",
                "",
                true,
                false,
                "",
                "",
                is_teleport,
            )
        } else {
            let url = windows::build_launch_url(
                &ticket,
                target.id,
                "",
                &browser_tracker_id,
                "",
                true,
                false,
                "",
                "",
                is_teleport,
            );
            windows::launch_url(&url)
        };

        if let Err(e) = launch_result {
            return reply(500, &format!("Failed to launch: {}", e), v2);
        }

        tokio::time::sleep(std::time::Duration::from_secs(3)).await;

        let pids_after = windows::get_roblox_pids();
        if let Some(&pid) = pids_after.iter().find(|p| !pids_before.contains(p)) {
            tracker.track(account.user_id, pid, browser_tracker_id);
        }

        reply(200, &format!("Following {} to {}", account.username, target_username), v2)
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (account, target);
        reply(500, "Launching is only supported on Windows", v2)
    }
}

async fn handle_set_server(
    Extension(state): Extension<AppState>,
    Query(params): Query<AccountQuery>,
    v2: bool,
) -> Response {
    let identifier = match params.account {
        Some(ref a) if !a.is_empty() => a,
        _ => return reply(400, "Missing Account parameter", v2),
    };

    let place_id: i64 = match params.place_id.as_deref().and_then(|v| v.parse().ok()) {
        Some(id) => id,
        None => return reply(400, "Missing or invalid PlaceId parameter", v2),
    };

    let job_id = match params.job_id {
        Some(ref j) if !j.is_empty() => j.clone(),
        _ => return reply(400, "Missing JobId parameter", v2),
    };

    let accounts = match state.accounts.get_all() {
        Ok(a) => a,
        Err(e) => return reply(500, &e, v2),
    };

    let account = match find_account(&accounts, identifier) {
        Some(a) => a,
        None => return reply(404, "Account not found", v2),
    };

    match roblox::join_game_instance(&account.security_token, place_id, &job_id, false).await {
        Ok(_) => reply(200, "Server set successfully", v2),
        Err(e) => reply(400, &e, v2),
    }
}

async fn handle_set_recommended_server(
    Extension(state): Extension<AppState>,
    Query(params): Query<AccountQuery>,
    v2: bool,
) -> Response {
    let identifier = match params.account {
        Some(ref a) if !a.is_empty() => a,
        _ => return reply(400, "Missing Account parameter", v2),
    };

    let place_id: i64 = match params.place_id.as_deref().and_then(|v| v.parse().ok()) {
        Some(id) => id,
        None => return reply(400, "Missing or invalid PlaceId parameter", v2),
    };

    let accounts = match state.accounts.get_all() {
        Ok(a) => a,
        Err(e) => return reply(500, &e, v2),
    };

    let account = match find_account(&accounts, identifier) {
        Some(a) => a,
        None => return reply(404, "Account not found", v2),
    };

    let servers_response = match roblox::get_servers(place_id, "Public", None, Some(&account.security_token)).await {
        Ok(r) => r,
        Err(e) => return reply(400, &format!("Failed to get servers: {}", e), v2),
    };

    if servers_response.data.is_empty() {
        return reply(400, "No servers available", v2);
    }

    let mut attempted: Vec<String> = Vec::new();

    for _ in 0..10 {
        for server in servers_response.data.iter().rev() {
            if attempted.contains(&server.id) {
                continue;
            }

            attempted.push(server.id.clone());

            match roblox::join_game_instance(&account.security_token, place_id, &server.id, false).await {
                Ok(_) => return reply(200, "Recommended server set successfully", v2),
                Err(_) => continue,
            }
        }

        if attempted.len() >= 100 {
            attempted.clear();
        }
    }

    reply(400, "Too many failed attempts", v2)
}

async fn handle_get_alias(
    Extension(state): Extension<AppState>,
    Query(params): Query<AccountQuery>,
    v2: bool,
) -> Response {
    let identifier = match params.account {
        Some(ref a) if !a.is_empty() => a,
        _ => return reply(400, "Missing Account parameter", v2),
    };

    let accounts = match state.accounts.get_all() {
        Ok(a) => a,
        Err(e) => return reply(500, &e, v2),
    };

    match find_account(&accounts, identifier) {
        Some(account) => reply(200, &account.alias, v2),
        None => reply(404, "Account not found", v2),
    }
}

async fn handle_get_description(
    Extension(state): Extension<AppState>,
    Query(params): Query<AccountQuery>,
    v2: bool,
) -> Response {
    let identifier = match params.account {
        Some(ref a) if !a.is_empty() => a,
        _ => return reply(400, "Missing Account parameter", v2),
    };

    let accounts = match state.accounts.get_all() {
        Ok(a) => a,
        Err(e) => return reply(500, &e, v2),
    };

    match find_account(&accounts, identifier) {
        Some(account) => reply(200, &account.description, v2),
        None => reply(404, "Account not found", v2),
    }
}

async fn handle_get_field(
    Extension(state): Extension<AppState>,
    Query(params): Query<AccountQuery>,
    v2: bool,
) -> Response {
    let identifier = match params.account {
        Some(ref a) if !a.is_empty() => a,
        _ => return reply(400, "Missing Account parameter", v2),
    };

    let field_name = match params.field {
        Some(ref f) if !f.is_empty() => f,
        _ => return reply(400, "Missing Field parameter", v2),
    };

    let accounts = match state.accounts.get_all() {
        Ok(a) => a,
        Err(e) => return reply(500, &e, v2),
    };

    match find_account(&accounts, identifier) {
        Some(account) => {
            let value = account.fields.get(field_name.as_str()).map(|v| v.as_str()).unwrap_or("");
            reply(200, value, v2)
        }
        None => reply(404, "Account not found", v2),
    }
}

async fn handle_set_field(
    Extension(state): Extension<AppState>,
    Query(params): Query<AccountQuery>,
    v2: bool,
) -> Response {
    if !state.settings.get_bool("WebServer", "AllowAccountEditing") {
        return reply(401, "AllowAccountEditing is disabled", v2);
    }

    let identifier = match params.account {
        Some(ref a) if !a.is_empty() => a,
        _ => return reply(400, "Missing Account parameter", v2),
    };

    let field_name = match params.field {
        Some(ref f) if !f.is_empty() => f.clone(),
        _ => return reply(400, "Missing Field parameter", v2),
    };

    let field_value = match params.value {
        Some(ref v) => v.clone(),
        None => return reply(400, "Missing Value parameter", v2),
    };

    let accounts = match state.accounts.get_all() {
        Ok(a) => a,
        Err(e) => return reply(500, &e, v2),
    };

    let mut account = match find_account(&accounts, identifier) {
        Some(a) => a,
        None => return reply(404, "Account not found", v2),
    };

    account.set_field(field_name, field_value);
    match state.accounts.update(account) {
        Ok(_) => reply(200, "Field set successfully", v2),
        Err(e) => reply(500, &e, v2),
    }
}

async fn handle_remove_field(
    Extension(state): Extension<AppState>,
    Query(params): Query<AccountQuery>,
    v2: bool,
) -> Response {
    if !state.settings.get_bool("WebServer", "AllowAccountEditing") {
        return reply(401, "AllowAccountEditing is disabled", v2);
    }

    let identifier = match params.account {
        Some(ref a) if !a.is_empty() => a,
        _ => return reply(400, "Missing Account parameter", v2),
    };

    let field_name = match params.field {
        Some(ref f) if !f.is_empty() => f,
        _ => return reply(400, "Missing Field parameter", v2),
    };

    let accounts = match state.accounts.get_all() {
        Ok(a) => a,
        Err(e) => return reply(500, &e, v2),
    };

    let mut account = match find_account(&accounts, identifier) {
        Some(a) => a,
        None => return reply(404, "Account not found", v2),
    };

    account.remove_field(field_name);
    match state.accounts.update(account) {
        Ok(_) => reply(200, "Field removed successfully", v2),
        Err(e) => reply(500, &e, v2),
    }
}

async fn handle_set_alias(
    Extension(state): Extension<AppState>,
    Query(params): Query<AccountQuery>,
    body: String,
    v2: bool,
) -> Response {
    if !state.settings.get_bool("WebServer", "AllowAccountEditing") {
        return reply(401, "AllowAccountEditing is disabled", v2);
    }

    let identifier = match params.account {
        Some(ref a) if !a.is_empty() => a,
        _ => return reply(400, "Missing Account parameter", v2),
    };

    if body.is_empty() {
        return reply(400, "Missing body", v2);
    }

    let accounts = match state.accounts.get_all() {
        Ok(a) => a,
        Err(e) => return reply(500, &e, v2),
    };

    let mut account = match find_account(&accounts, identifier) {
        Some(a) => a,
        None => return reply(404, "Account not found", v2),
    };

    account.alias = body;
    match state.accounts.update(account) {
        Ok(_) => reply(200, "Alias set successfully", v2),
        Err(e) => reply(500, &e, v2),
    }
}

async fn handle_set_description(
    Extension(state): Extension<AppState>,
    Query(params): Query<AccountQuery>,
    body: String,
    v2: bool,
) -> Response {
    if !state.settings.get_bool("WebServer", "AllowAccountEditing") {
        return reply(401, "AllowAccountEditing is disabled", v2);
    }

    let identifier = match params.account {
        Some(ref a) if !a.is_empty() => a,
        _ => return reply(400, "Missing Account parameter", v2),
    };

    if body.is_empty() {
        return reply(400, "Missing body", v2);
    }

    let accounts = match state.accounts.get_all() {
        Ok(a) => a,
        Err(e) => return reply(500, &e, v2),
    };

    let mut account = match find_account(&accounts, identifier) {
        Some(a) => a,
        None => return reply(404, "Account not found", v2),
    };

    account.description = body;
    match state.accounts.update(account) {
        Ok(_) => reply(200, "Description set successfully", v2),
        Err(e) => reply(500, &e, v2),
    }
}

async fn handle_append_description(
    Extension(state): Extension<AppState>,
    Query(params): Query<AccountQuery>,
    body: String,
    v2: bool,
) -> Response {
    if !state.settings.get_bool("WebServer", "AllowAccountEditing") {
        return reply(401, "AllowAccountEditing is disabled", v2);
    }

    let identifier = match params.account {
        Some(ref a) if !a.is_empty() => a,
        _ => return reply(400, "Missing Account parameter", v2),
    };

    if body.is_empty() {
        return reply(400, "Missing body", v2);
    }

    let accounts = match state.accounts.get_all() {
        Ok(a) => a,
        Err(e) => return reply(500, &e, v2),
    };

    let mut account = match find_account(&accounts, identifier) {
        Some(a) => a,
        None => return reply(404, "Account not found", v2),
    };

    account.description.push_str(&body);
    match state.accounts.update(account) {
        Ok(_) => reply(200, "Description appended successfully", v2),
        Err(e) => reply(500, &e, v2),
    }
}

async fn handle_set_avatar(
    Extension(state): Extension<AppState>,
    Query(params): Query<AccountQuery>,
    body: String,
    v2: bool,
) -> Response {
    let identifier = match params.account {
        Some(ref a) if !a.is_empty() => a,
        _ => return reply(400, "Missing Account parameter", v2),
    };

    let avatar_json: serde_json::Value = match serde_json::from_str(&body) {
        Ok(v) => v,
        Err(_) => return reply(400, "Invalid JSON body", v2),
    };

    let accounts = match state.accounts.get_all() {
        Ok(a) => a,
        Err(e) => return reply(500, &e, v2),
    };

    let account = match find_account(&accounts, identifier) {
        Some(a) => a,
        None => return reply(404, "Account not found", v2),
    };

    match roblox::set_avatar(&account.security_token, avatar_json).await {
        Ok(_) => reply(200, "Avatar set successfully", v2),
        Err(e) => reply(400, &e, v2),
    }
}

async fn handle_block_user(
    Extension(state): Extension<AppState>,
    Query(params): Query<AccountQuery>,
    v2: bool,
) -> Response {
    let identifier = match params.account {
        Some(ref a) if !a.is_empty() => a,
        _ => return reply(400, "Missing Account parameter", v2),
    };

    let target_user_id: i64 = match params.user_id.as_deref().and_then(|v| v.parse().ok()) {
        Some(id) => id,
        None => return reply(400, "Missing or invalid UserId parameter", v2),
    };

    let accounts = match state.accounts.get_all() {
        Ok(a) => a,
        Err(e) => return reply(500, &e, v2),
    };

    let account = match find_account(&accounts, identifier) {
        Some(a) => a,
        None => return reply(404, "Account not found", v2),
    };

    match roblox::block_user(&account.security_token, target_user_id).await {
        Ok(_) => reply(200, "User blocked successfully", v2),
        Err(e) => reply(500, &e, v2),
    }
}

async fn handle_unblock_user(
    Extension(state): Extension<AppState>,
    Query(params): Query<AccountQuery>,
    v2: bool,
) -> Response {
    let identifier = match params.account {
        Some(ref a) if !a.is_empty() => a,
        _ => return reply(400, "Missing Account parameter", v2),
    };

    let target_user_id: i64 = match params.user_id.as_deref().and_then(|v| v.parse().ok()) {
        Some(id) => id,
        None => return reply(400, "Missing or invalid UserId parameter", v2),
    };

    let accounts = match state.accounts.get_all() {
        Ok(a) => a,
        Err(e) => return reply(500, &e, v2),
    };

    let account = match find_account(&accounts, identifier) {
        Some(a) => a,
        None => return reply(404, "Account not found", v2),
    };

    match roblox::unblock_user(&account.security_token, target_user_id).await {
        Ok(_) => reply(200, "User unblocked successfully", v2),
        Err(e) => reply(500, &e, v2),
    }
}

async fn handle_get_blocked_list(
    Extension(state): Extension<AppState>,
    Query(params): Query<AccountQuery>,
    v2: bool,
) -> Response {
    let identifier = match params.account {
        Some(ref a) if !a.is_empty() => a,
        _ => return reply(400, "Missing Account parameter", v2),
    };

    let accounts = match state.accounts.get_all() {
        Ok(a) => a,
        Err(e) => return reply(500, &e, v2),
    };

    let account = match find_account(&accounts, identifier) {
        Some(a) => a,
        None => return reply(404, "Account not found", v2),
    };

    match roblox::get_blocked_users(&account.security_token).await {
        Ok(blocked) => {
            let body = serde_json::to_string(&blocked).unwrap_or_else(|_| "[]".to_string());
            if v2 {
                let wrapper = serde_json::json!({
                    "Success": true,
                    "Message": blocked,
                });
                Response::builder()
                    .status(200)
                    .header("content-type", "application/json; charset=utf-8")
                    .body(Body::from(wrapper.to_string()))
                    .unwrap()
            } else {
                Response::builder()
                    .status(200)
                    .header("content-type", "application/json; charset=utf-8")
                    .body(Body::from(body))
                    .unwrap()
            }
        }
        Err(e) => reply(500, &e, v2),
    }
}

async fn handle_unblock_everyone(
    Extension(state): Extension<AppState>,
    Query(params): Query<AccountQuery>,
    v2: bool,
) -> Response {
    let identifier = match params.account {
        Some(ref a) if !a.is_empty() => a,
        _ => return reply(400, "Missing Account parameter", v2),
    };

    let accounts = match state.accounts.get_all() {
        Ok(a) => a,
        Err(e) => return reply(500, &e, v2),
    };

    let account = match find_account(&accounts, identifier) {
        Some(a) => a,
        None => return reply(404, "Account not found", v2),
    };

    match roblox::unblock_all_users(&account.security_token).await {
        Ok(count) => reply(200, &format!("Unblocked {} users", count), v2),
        Err(e) => reply(500, &e, v2),
    }
}

fn check_password(state: &AppState, password: &Option<String>) -> bool {
    let ws_password = state.settings.get_string("WebServer", "Password");
    let every_request_requires_password = state
        .settings
        .get_bool("WebServer", "EveryRequestRequiresPassword");

    if ws_password.len() < 6 {
        return false;
    }

    if every_request_requires_password {
        return matches!(password, Some(p) if *p == ws_password);
    }

    match password {
        Some(p) => *p == ws_password,
        None => true,
    }
}

async fn v1_running(ext: Extension<AppState>) -> Response {
    handle_running(ext, false).await
}
async fn v2_running(ext: Extension<AppState>) -> Response {
    handle_running(ext, true).await
}

async fn v1_get_accounts(ext: Extension<AppState>, q: Query<AccountQuery>) -> Response {
    handle_get_accounts(ext, q, false).await
}
async fn v2_get_accounts(ext: Extension<AppState>, q: Query<AccountQuery>) -> Response {
    handle_get_accounts(ext, q, true).await
}

async fn v1_get_accounts_json(ext: Extension<AppState>, q: Query<AccountQuery>) -> Response {
    handle_get_accounts_json(ext, q, false).await
}
async fn v2_get_accounts_json(ext: Extension<AppState>, q: Query<AccountQuery>) -> Response {
    handle_get_accounts_json(ext, q, true).await
}

async fn v1_import_cookie(ext: Extension<AppState>, q: Query<AccountQuery>) -> Response {
    handle_import_cookie(ext, q, false).await
}
async fn v2_import_cookie(ext: Extension<AppState>, q: Query<AccountQuery>) -> Response {
    handle_import_cookie(ext, q, true).await
}

async fn v1_get_cookie(ext: Extension<AppState>, q: Query<AccountQuery>) -> Response {
    handle_get_cookie(ext, q, false).await
}
async fn v2_get_cookie(ext: Extension<AppState>, q: Query<AccountQuery>) -> Response {
    handle_get_cookie(ext, q, true).await
}

async fn v1_get_csrf_token(ext: Extension<AppState>, q: Query<AccountQuery>) -> Response {
    handle_get_csrf_token(ext, q, false).await
}
async fn v2_get_csrf_token(ext: Extension<AppState>, q: Query<AccountQuery>) -> Response {
    handle_get_csrf_token(ext, q, true).await
}

async fn v1_launch_account(ext: Extension<AppState>, q: Query<AccountQuery>) -> Response {
    handle_launch_account(ext, q, false).await
}
async fn v2_launch_account(ext: Extension<AppState>, q: Query<AccountQuery>) -> Response {
    handle_launch_account(ext, q, true).await
}

async fn v1_follow_user(ext: Extension<AppState>, q: Query<AccountQuery>) -> Response {
    handle_follow_user(ext, q, false).await
}
async fn v2_follow_user(ext: Extension<AppState>, q: Query<AccountQuery>) -> Response {
    handle_follow_user(ext, q, true).await
}

async fn v1_set_server(ext: Extension<AppState>, q: Query<AccountQuery>) -> Response {
    handle_set_server(ext, q, false).await
}
async fn v2_set_server(ext: Extension<AppState>, q: Query<AccountQuery>) -> Response {
    handle_set_server(ext, q, true).await
}

async fn v1_set_recommended_server(ext: Extension<AppState>, q: Query<AccountQuery>) -> Response {
    handle_set_recommended_server(ext, q, false).await
}
async fn v2_set_recommended_server(ext: Extension<AppState>, q: Query<AccountQuery>) -> Response {
    handle_set_recommended_server(ext, q, true).await
}

async fn v1_get_alias(ext: Extension<AppState>, q: Query<AccountQuery>) -> Response {
    handle_get_alias(ext, q, false).await
}
async fn v2_get_alias(ext: Extension<AppState>, q: Query<AccountQuery>) -> Response {
    handle_get_alias(ext, q, true).await
}

async fn v1_get_description(ext: Extension<AppState>, q: Query<AccountQuery>) -> Response {
    handle_get_description(ext, q, false).await
}
async fn v2_get_description(ext: Extension<AppState>, q: Query<AccountQuery>) -> Response {
    handle_get_description(ext, q, true).await
}

async fn v1_get_field(ext: Extension<AppState>, q: Query<AccountQuery>) -> Response {
    handle_get_field(ext, q, false).await
}
async fn v2_get_field(ext: Extension<AppState>, q: Query<AccountQuery>) -> Response {
    handle_get_field(ext, q, true).await
}

async fn v1_set_field(ext: Extension<AppState>, q: Query<AccountQuery>) -> Response {
    handle_set_field(ext, q, false).await
}
async fn v2_set_field(ext: Extension<AppState>, q: Query<AccountQuery>) -> Response {
    handle_set_field(ext, q, true).await
}

async fn v1_remove_field(ext: Extension<AppState>, q: Query<AccountQuery>) -> Response {
    handle_remove_field(ext, q, false).await
}
async fn v2_remove_field(ext: Extension<AppState>, q: Query<AccountQuery>) -> Response {
    handle_remove_field(ext, q, true).await
}

async fn v1_set_alias(ext: Extension<AppState>, q: Query<AccountQuery>, body: String) -> Response {
    handle_set_alias(ext, q, body, false).await
}
async fn v2_set_alias(ext: Extension<AppState>, q: Query<AccountQuery>, body: String) -> Response {
    handle_set_alias(ext, q, body, true).await
}

async fn v1_set_description(ext: Extension<AppState>, q: Query<AccountQuery>, body: String) -> Response {
    handle_set_description(ext, q, body, false).await
}
async fn v2_set_description(ext: Extension<AppState>, q: Query<AccountQuery>, body: String) -> Response {
    handle_set_description(ext, q, body, true).await
}

async fn v1_append_description(ext: Extension<AppState>, q: Query<AccountQuery>, body: String) -> Response {
    handle_append_description(ext, q, body, false).await
}
async fn v2_append_description(ext: Extension<AppState>, q: Query<AccountQuery>, body: String) -> Response {
    handle_append_description(ext, q, body, true).await
}

async fn v1_set_avatar(ext: Extension<AppState>, q: Query<AccountQuery>, body: String) -> Response {
    handle_set_avatar(ext, q, body, false).await
}
async fn v2_set_avatar(ext: Extension<AppState>, q: Query<AccountQuery>, body: String) -> Response {
    handle_set_avatar(ext, q, body, true).await
}

async fn v1_block_user(ext: Extension<AppState>, q: Query<AccountQuery>) -> Response {
    handle_block_user(ext, q, false).await
}
async fn v2_block_user(ext: Extension<AppState>, q: Query<AccountQuery>) -> Response {
    handle_block_user(ext, q, true).await
}

async fn v1_unblock_user(ext: Extension<AppState>, q: Query<AccountQuery>) -> Response {
    handle_unblock_user(ext, q, false).await
}
async fn v2_unblock_user(ext: Extension<AppState>, q: Query<AccountQuery>) -> Response {
    handle_unblock_user(ext, q, true).await
}

async fn v1_get_blocked_list(ext: Extension<AppState>, q: Query<AccountQuery>) -> Response {
    handle_get_blocked_list(ext, q, false).await
}
async fn v2_get_blocked_list(ext: Extension<AppState>, q: Query<AccountQuery>) -> Response {
    handle_get_blocked_list(ext, q, true).await
}

async fn v1_unblock_everyone(ext: Extension<AppState>, q: Query<AccountQuery>) -> Response {
    handle_unblock_everyone(ext, q, false).await
}
async fn v2_unblock_everyone(ext: Extension<AppState>, q: Query<AccountQuery>) -> Response {
    handle_unblock_everyone(ext, q, true).await
}

fn build_router(state: AppState) -> Router {
    Router::new()
        .route("/Running", get(v1_running))
        .route("/v2/Running", get(v2_running))
        .route("/GetAccounts", get(v1_get_accounts))
        .route("/v2/GetAccounts", get(v2_get_accounts))
        .route("/GetAccountsJson", get(v1_get_accounts_json))
        .route("/v2/GetAccountsJson", get(v2_get_accounts_json))
        .route("/ImportCookie", get(v1_import_cookie))
        .route("/v2/ImportCookie", get(v2_import_cookie))
        .route("/GetCookie", get(v1_get_cookie))
        .route("/v2/GetCookie", get(v2_get_cookie))
        .route("/GetCSRFToken", get(v1_get_csrf_token))
        .route("/v2/GetCSRFToken", get(v2_get_csrf_token))
        .route("/LaunchAccount", get(v1_launch_account))
        .route("/v2/LaunchAccount", get(v2_launch_account))
        .route("/FollowUser", get(v1_follow_user))
        .route("/v2/FollowUser", get(v2_follow_user))
        .route("/SetServer", get(v1_set_server))
        .route("/v2/SetServer", get(v2_set_server))
        .route("/SetRecommendedServer", get(v1_set_recommended_server))
        .route("/v2/SetRecommendedServer", get(v2_set_recommended_server))
        .route("/GetAlias", get(v1_get_alias))
        .route("/v2/GetAlias", get(v2_get_alias))
        .route("/GetDescription", get(v1_get_description))
        .route("/v2/GetDescription", get(v2_get_description))
        .route("/GetField", get(v1_get_field))
        .route("/v2/GetField", get(v2_get_field))
        .route("/SetField", post(v1_set_field))
        .route("/v2/SetField", post(v2_set_field))
        .route("/RemoveField", post(v1_remove_field))
        .route("/v2/RemoveField", post(v2_remove_field))
        .route("/SetAlias", post(v1_set_alias))
        .route("/v2/SetAlias", post(v2_set_alias))
        .route("/SetDescription", post(v1_set_description))
        .route("/v2/SetDescription", post(v2_set_description))
        .route("/AppendDescription", post(v1_append_description))
        .route("/v2/AppendDescription", post(v2_append_description))
        .route("/SetAvatar", post(v1_set_avatar))
        .route("/v2/SetAvatar", post(v2_set_avatar))
        .route("/BlockUser", post(v1_block_user))
        .route("/v2/BlockUser", post(v2_block_user))
        .route("/UnblockUser", post(v1_unblock_user))
        .route("/v2/UnblockUser", post(v2_unblock_user))
        .route("/GetBlockedList", get(v1_get_blocked_list))
        .route("/v2/GetBlockedList", get(v2_get_blocked_list))
        .route("/UnblockEveryone", post(v1_unblock_everyone))
        .route("/v2/UnblockEveryone", post(v2_unblock_everyone))
        .layer(middleware::from_fn_with_state((), external_check))
        .layer(Extension(state))
}

pub async fn start(accounts: &'static AccountStore, settings: &'static SettingsStore) -> Result<u16, String> {
    {
        let guard = SERVER_STATE.lock().map_err(|e| e.to_string())?;
        if guard.is_some() {
            return Err("Web server is already running".into());
        }
    }

    let port = settings.get_int("WebServer", "WebServerPort").unwrap_or(7963) as u16;
    let allow_external = settings.get_bool("WebServer", "AllowExternalConnections");

    let bind_addr: SocketAddr = if allow_external {
        ([0, 0, 0, 0], port).into()
    } else {
        ([127, 0, 0, 1], port).into()
    };

    let state = AppState {
        accounts,
        settings,
    };

    let app = build_router(state);

    let listener = tokio::net::TcpListener::bind(bind_addr)
        .await
        .map_err(|e| format!("Failed to bind to {}: {}", bind_addr, e))?;

    let (shutdown_tx, mut shutdown_rx) = watch::channel(false);

    tokio::spawn(async move {
        axum::serve(
            listener,
            app.into_make_service_with_connect_info::<SocketAddr>(),
        )
        .with_graceful_shutdown(async move {
            while !*shutdown_rx.borrow_and_update() {
                if shutdown_rx.changed().await.is_err() {
                    break;
                }
            }
        })
        .await
        .ok();
    });

    let mut guard = SERVER_STATE.lock().map_err(|e| e.to_string())?;
    *guard = Some(ServerHandle { shutdown_tx, port });

    Ok(port)
}

pub fn stop() -> Result<(), String> {
    let mut guard = SERVER_STATE.lock().map_err(|e| e.to_string())?;
    match guard.take() {
        Some(handle) => {
            let _ = handle.shutdown_tx.send(true);
            Ok(())
        }
        None => Err("Web server is not running".into()),
    }
}

pub fn is_running() -> bool {
    SERVER_STATE
        .lock()
        .map(|g| g.is_some())
        .unwrap_or(false)
}

pub fn get_port() -> u16 {
    SERVER_STATE
        .lock()
        .ok()
        .and_then(|g| g.as_ref().map(|h| h.port))
        .unwrap_or(0)
}

#[derive(Debug, Clone, Serialize)]
pub struct WebServerStatus {
    pub running: bool,
    pub port: u16,
}
