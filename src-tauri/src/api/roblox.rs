use reqwest::header::COOKIE;
use serde::{Deserialize, Serialize};
use tokio::time::{sleep, Duration};

fn cookie_header(security_token: &str) -> String {
    format!(".ROBLOSECURITY={}", security_token)
}

fn game_join_client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent("Roblox/WinInet")
        .build()
        .unwrap()
}

fn no_redirect_client() -> reqwest::Client {
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap()
}

async fn send_with_retry<F>(mut make_request: F) -> Result<reqwest::Response, String>
where
    F: FnMut() -> reqwest::RequestBuilder,
{
    let mut last_error = String::new();

    for attempt in 0..3 {
        match make_request().send().await {
            Ok(response) => {
                if response.status().as_u16() == 429 && attempt < 2 {
                    let delay = Duration::from_millis(400 * 2_u64.pow(attempt as u32));
                    sleep(delay).await;
                    continue;
                }
                return Ok(response);
            }
            Err(e) => {
                last_error = e.to_string();
                if attempt < 2 {
                    let delay = Duration::from_millis(400 * 2_u64.pow(attempt as u32));
                    sleep(delay).await;
                    continue;
                }
            }
        }
    }

    Err(format!("Request failed: {}", last_error))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserLookupResult {
    pub id: i64,
    pub name: String,
    #[serde(rename = "displayName", default)]
    pub display_name: String,
}

pub async fn get_user_id(security_token: Option<&str>, username: &str) -> Result<UserLookupResult, String> {
    let client = reqwest::Client::new();

    let mut request = client
        .post("https://users.roblox.com/v1/usernames/users")
        .json(&serde_json::json!({ "usernames": [username] }));

    if let Some(token) = security_token {
        request = request.header(COOKIE, cookie_header(token));
    }

    let response = request
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Failed to look up user (status {})", response.status().as_u16()));
    }

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let user = body["data"]
        .as_array()
        .and_then(|arr| arr.first())
        .ok_or_else(|| format!("User '{}' not found", username))?;

    serde_json::from_value(user.clone())
        .map_err(|e| format!("Failed to parse user data: {}", e))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserInfo {
    pub id: i64,
    pub name: String,
    #[serde(rename = "displayName")]
    pub display_name: String,
    #[serde(rename = "description", default)]
    pub description: String,
    #[serde(rename = "created", default)]
    pub created: String,
    #[serde(rename = "isBanned", default)]
    pub is_banned: bool,
    #[serde(rename = "hasVerifiedBadge", default)]
    pub has_verified_badge: bool,
}

pub async fn get_user_info(security_token: Option<&str>, user_id: i64) -> Result<UserInfo, String> {
    let client = reqwest::Client::new();

    let mut request = client
        .get(format!("https://users.roblox.com/v1/users/{}", user_id));

    if let Some(token) = security_token {
        request = request.header(COOKIE, cookie_header(token));
    }

    let response = request
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Failed to get user info (status {})", response.status().as_u16()));
    }

    response
        .json()
        .await
        .map_err(|e| format!("Failed to parse user info: {}", e))
}

pub async fn get_robux(security_token: &str) -> Result<i64, String> {
    let client = reqwest::Client::new();

    let response = client
        .get("https://economy.roblox.com/v1/user/currency")
        .header(COOKIE, cookie_header(security_token))
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if response.status().is_success() {
        let body: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))?;
        return Ok(body["robux"].as_i64().unwrap_or(0));
    }

    let client = no_redirect_client();

    let response = client
        .get("https://www.roblox.com/mobileapi/userinfo")
        .header(COOKIE, cookie_header(security_token))
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Failed to get robux (status {}) {}", status, &body[..body.len().min(200)]));
    }

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(body["RobuxBalance"].as_i64().unwrap_or(0))
}

pub async fn get_email_info(security_token: &str) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();

    let response = client
        .get("https://accountsettings.roblox.com/v1/email")
        .header(COOKIE, cookie_header(security_token))
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Failed to get email info (status {})", response.status().as_u16()));
    }

    response
        .json()
        .await
        .map_err(|e| format!("Failed to parse email info: {}", e))
}

pub async fn send_friend_request(security_token: &str, target_user_id: i64) -> Result<(), String> {
    let csrf = crate::api::auth::get_csrf_token(security_token).await?;
    let client = reqwest::Client::new();

    let response = client
        .post(format!("https://friends.roblox.com/v1/users/{}/request-friendship", target_user_id))
        .header(COOKIE, cookie_header(security_token))
        .header("X-CSRF-TOKEN", &csrf)
        .header("Content-Type", "application/json")
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if response.status().is_success() {
        Ok(())
    } else {
        let body = response.text().await.unwrap_or_default();
        Err(format!("Failed to send friend request: {}", body))
    }
}

pub async fn block_user(security_token: &str, target_user_id: i64) -> Result<(), String> {
    let csrf = crate::api::auth::get_csrf_token(security_token).await?;
    let client = reqwest::Client::new();

    let response = client
        .post(format!("https://apis.roblox.com/user-blocking-api/v1/users/{}/block-user", target_user_id))
        .header(COOKIE, cookie_header(security_token))
        .header("X-CSRF-TOKEN", &csrf)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if response.status().is_success() {
        Ok(())
    } else {
        Err(format!("Failed to block user (status {})", response.status().as_u16()))
    }
}

pub async fn unblock_user(security_token: &str, target_user_id: i64) -> Result<(), String> {
    let csrf = crate::api::auth::get_csrf_token(security_token).await?;
    let client = reqwest::Client::new();

    let response = client
        .post(format!("https://apis.roblox.com/user-blocking-api/v1/users/{}/unblock-user", target_user_id))
        .header(COOKIE, cookie_header(security_token))
        .header("X-CSRF-TOKEN", &csrf)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if response.status().is_success() {
        Ok(())
    } else {
        Err(format!("Failed to unblock user (status {})", response.status().as_u16()))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockedUser {
    #[serde(rename = "userId")]
    pub user_id: i64,
    #[serde(default)]
    pub name: String,
    #[serde(rename = "displayName", default)]
    pub display_name: String,
}

pub async fn get_blocked_users(security_token: &str) -> Result<Vec<BlockedUser>, String> {
    let client = reqwest::Client::new();

    let response = client
        .get("https://apis.roblox.com/user-blocking-api/v1/users/get-blocked-users")
        .header(COOKIE, cookie_header(security_token))
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Failed to get blocked users (status {}) {}", status, &body[..body.len().min(200)]));
    }

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse blocked users: {}", e))?;

    if let Some(blocked) = body["blockedUsers"].as_array() {
        let mut users = Vec::new();
        for item in blocked {
            if let Some(user_id) = item["userId"].as_i64() {
                users.push(BlockedUser {
                    user_id,
                    name: item["name"].as_str().unwrap_or_default().to_string(),
                    display_name: item["displayName"].as_str().unwrap_or_default().to_string(),
                });
            }
        }
        if users.iter().all(|u| u.name.is_empty()) && !users.is_empty() {
            let ids: Vec<i64> = users.iter().map(|u| u.user_id).collect();
            if let Ok(infos) = lookup_user_names(&ids).await {
                for user in &mut users {
                    if let Some(info) = infos.iter().find(|i| i.id == user.user_id) {
                        user.name = info.name.clone();
                        user.display_name = info.display_name.clone();
                    }
                }
            }
        }
        return Ok(users);
    }

    Ok(Vec::new())
}

async fn lookup_user_names(user_ids: &[i64]) -> Result<Vec<UserLookupResult>, String> {
    let client = reqwest::Client::new();
    let mut results = Vec::new();

    for chunk in user_ids.chunks(100) {
        let response = client
            .post("https://users.roblox.com/v1/users")
            .json(&serde_json::json!({ "userIds": chunk }))
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;

        if response.status().is_success() {
            let body: serde_json::Value = response.json().await.unwrap_or_default();
            if let Some(data) = body["data"].as_array() {
                for user in data {
                    if let Ok(u) = serde_json::from_value::<UserLookupResult>(user.clone()) {
                        results.push(u);
                    }
                }
            }
        }
    }

    Ok(results)
}

pub async fn unblock_all_users(security_token: &str) -> Result<i32, String> {
    let blocked = get_blocked_users(security_token).await?;
    let mut count = 0;

    for user in &blocked {
        if unblock_user(security_token, user.user_id).await.is_ok() {
            count += 1;
        }
    }

    Ok(count)
}

pub async fn set_follow_privacy(security_token: &str, privacy: &str) -> Result<(), String> {
    let csrf = crate::api::auth::get_csrf_token(security_token).await?;
    let client = reqwest::Client::new();

    let response = client
        .post("https://www.roblox.com/account/settings/follow-me-privacy")
        .header(COOKIE, cookie_header(security_token))
        .header("Referer", "https://www.roblox.com/my/account")
        .header("X-CSRF-TOKEN", &csrf)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(format!("FollowMePrivacy={}", privacy))
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if response.status().is_success() {
        Ok(())
    } else {
        Err(format!("Failed to set follow privacy (status {})", response.status().as_u16()))
    }
}

pub async fn get_private_server_invite_privacy(security_token: &str) -> Result<String, String> {
    let client = reqwest::Client::new();

    let response = client
        .get("https://accountsettings.roblox.com/v1/privacy")
        .header(COOKIE, cookie_header(security_token))
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Failed to get privacy settings (status {})", response.status().as_u16()));
    }

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse privacy settings: {}", e))?;

    if let Some(val) = body.get("privateServerInvitePrivacy").and_then(|v| v.as_str()) {
        return Ok(val.to_string());
    }

    Ok(body.to_string())
}

pub async fn set_private_server_invite_privacy(security_token: &str, privacy: &str) -> Result<(), String> {
    let csrf = crate::api::auth::get_csrf_token(security_token).await?;
    let client = reqwest::Client::new();

    let response = client
        .patch("https://accountsettings.roblox.com/v1/privacy")
        .header(COOKIE, cookie_header(security_token))
        .header("X-CSRF-TOKEN", &csrf)
        .json(&serde_json::json!({
            "privateServerInvitePrivacy": privacy
        }))
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if response.status().is_success() {
        Ok(())
    } else {
        let body = response.text().await.unwrap_or_default();
        Err(format!("Failed to set privacy: {}", &body[..body.len().min(200)]))
    }
}

pub async fn set_avatar(security_token: &str, avatar_json: serde_json::Value) -> Result<Vec<i64>, String> {
    let csrf = crate::api::auth::get_csrf_token(security_token).await?;
    let client = reqwest::Client::new();
    let mut invalid_assets = Vec::new();

    if let Some(avatar_type) = avatar_json.get("playerAvatarType") {
        client
            .post("https://avatar.roblox.com/v1/avatar/set-player-avatar-type")
            .header(COOKIE, cookie_header(security_token))
            .header("X-CSRF-TOKEN", &csrf)
            .json(&serde_json::json!({ "playerAvatarType": avatar_type }))
            .send()
            .await
            .map_err(|e| format!("Failed to set avatar type: {}", e))?;
    }

    let scales = avatar_json.get("scales").or_else(|| avatar_json.get("scale"));
    if let Some(scale_obj) = scales {
        client
            .post("https://avatar.roblox.com/v1/avatar/set-scales")
            .header(COOKIE, cookie_header(security_token))
            .header("X-CSRF-TOKEN", &csrf)
            .json(scale_obj)
            .send()
            .await
            .map_err(|e| format!("Failed to set scales: {}", e))?;
    }

    if let Some(body_colors) = avatar_json.get("bodyColors") {
        client
            .post("https://avatar.roblox.com/v1/avatar/set-body-colors")
            .header(COOKIE, cookie_header(security_token))
            .header("X-CSRF-TOKEN", &csrf)
            .json(body_colors)
            .send()
            .await
            .map_err(|e| format!("Failed to set body colors: {}", e))?;
    }

    if let Some(assets) = avatar_json.get("assets") {
        let response = client
            .post("https://avatar.roblox.com/v2/avatar/set-wearing-assets")
            .header(COOKIE, cookie_header(security_token))
            .header("X-CSRF-TOKEN", &csrf)
            .json(&serde_json::json!({ "assets": assets }))
            .send()
            .await
            .map_err(|e| format!("Failed to set wearing assets: {}", e))?;

        if response.status().is_success() {
            if let Ok(body) = response.json::<serde_json::Value>().await {
                if let Some(ids) = body.get("invalidAssetIds").and_then(|v| v.as_array()) {
                    for id in ids {
                        if let Some(n) = id.as_i64() {
                            invalid_assets.push(n);
                        }
                    }
                }
            }
        }
    }

    Ok(invalid_assets)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutfitInfo {
    pub id: i64,
    pub name: String,
}

pub async fn get_outfits(user_id: i64) -> Result<Vec<OutfitInfo>, String> {
    let client = reqwest::Client::new();

    let response = client
        .get(format!("https://avatar.roblox.com/v1/users/{}/outfits?page=1&itemsPerPage=50", user_id))
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Failed to get outfits (status {})", response.status().as_u16()));
    }

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse outfits: {}", e))?;

    Ok(body["data"]
        .as_array()
        .map(|arr| arr.iter().filter_map(|v| serde_json::from_value(v.clone()).ok()).collect())
        .unwrap_or_default())
}

pub async fn get_outfit_details(outfit_id: i64) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();

    let response = client
        .get(format!("https://avatar.roblox.com/v1/outfits/{}/details", outfit_id))
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Failed to get outfit details (status {})", response.status().as_u16()));
    }

    response.json().await.map_err(|e| format!("Failed to parse outfit details: {}", e))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaceDetails {
    #[serde(rename = "placeId")]
    pub place_id: i64,
    #[serde(rename = "universeId")]
    pub universe_id: i64,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(rename = "sourceName", default)]
    pub source_name: String,
    #[serde(rename = "sourceDescription", default)]
    pub source_description: String,
    #[serde(default)]
    pub url: String,
    #[serde(rename = "reasonProhibited", default)]
    pub reason_prohibited: String,
}

pub async fn get_place_details(place_ids: &[i64], security_token: Option<&str>) -> Result<Vec<PlaceDetails>, String> {
    if place_ids.is_empty() {
        return Ok(Vec::new());
    }

    let client = reqwest::Client::new();
    let mut all_details = Vec::new();

    for chunk in place_ids.chunks(50) {
        let query: String = chunk.iter().map(|id| format!("placeIds={}", id)).collect::<Vec<_>>().join("&");

        let mut request = client.get(format!("https://games.roblox.com/v1/games/multiget-place-details?{}", query));

        if let Some(token) = security_token {
            request = request.header(COOKIE, cookie_header(token));
        }

        let response = request.send().await.map_err(|e| format!("Request failed: {}", e))?;

        if response.status().is_success() {
            let details: Vec<PlaceDetails> = response.json().await.map_err(|e| format!("Failed to parse: {}", e))?;
            all_details.extend(details);
        }
    }

    Ok(all_details)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerData {
    pub id: String,
    #[serde(rename = "maxPlayers")]
    pub max_players: i32,
    pub playing: i32,
    #[serde(rename = "playerTokens", default)]
    pub player_tokens: Vec<String>,
    #[serde(default)]
    pub fps: f64,
    #[serde(default)]
    pub ping: Option<i64>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(rename = "vipServerId", default)]
    pub vip_server_id: Option<i64>,
    #[serde(rename = "accessCode", default)]
    pub access_code: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServersResponse {
    pub data: Vec<ServerData>,
    #[serde(rename = "nextPageCursor")]
    pub next_page_cursor: Option<String>,
}

pub async fn get_servers(
    place_id: i64,
    server_type: &str,
    cursor: Option<&str>,
    security_token: Option<&str>,
) -> Result<ServersResponse, String> {
    let client = reqwest::Client::new();
    let limit = if server_type == "VIP" { 25 } else { 100 };
    let mut url = format!(
        "https://games.roblox.com/v1/games/{}/servers/{}?sortOrder=Asc&limit={}",
        place_id, server_type, limit
    );

    if let Some(c) = cursor {
        url.push_str(&format!("&cursor={}", c));
    }

    let response = send_with_retry(|| {
        let mut request = client.get(&url);
        if let Some(token) = security_token {
            request = request.header(COOKIE, cookie_header(token));
        }
        if server_type == "VIP" {
            request = request.header("Accept", "application/json");
        }
        request
    })
    .await?;

    if !response.status().is_success() {
        return Err(format!("Failed to get servers (status {})", response.status().as_u16()));
    }

    response.json().await.map_err(|e| format!("Failed to parse servers: {}", e))
}

pub async fn join_game_instance(
    security_token: &str,
    place_id: i64,
    game_id: &str,
    is_teleport: bool,
) -> Result<serde_json::Value, String> {
    let csrf = crate::api::auth::get_csrf_token(security_token).await?;
    let client = game_join_client();

    let mut body = serde_json::json!({
        "gameId": game_id,
        "placeId": place_id,
    });

    if is_teleport {
        body["isTeleport"] = serde_json::json!(true);
    }

    let response = client
        .post("https://gamejoin.roblox.com/v1/join-game-instance")
        .header(COOKIE, cookie_header(security_token))
        .header("X-CSRF-TOKEN", &csrf)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Failed to join game instance: {}", text));
    }

    response.json().await.map_err(|e| format!("Failed to parse join response: {}", e))
}

pub async fn join_game(security_token: &str, place_id: i64) -> Result<serde_json::Value, String> {
    let csrf = crate::api::auth::get_csrf_token(security_token).await?;
    let client = game_join_client();

    let response = client
        .post("https://gamejoin.roblox.com/v1/join-game")
        .header(COOKIE, cookie_header(security_token))
        .header("X-CSRF-TOKEN", &csrf)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "placeId": place_id }))
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    response.json().await.map_err(|e| format!("Failed to parse join response: {}", e))
}

pub async fn search_games(security_token: Option<&str>, keyword: &str, _start: i32) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let session_id = format!("{:x}", now);

    if keyword.is_empty() {
        let url = format!(
            "https://apis.roblox.com/explore-api/v1/get-sorts?sessionId={}",
            session_id
        );
        let response = send_with_retry(|| {
            let mut req = client.get(&url);
            if let Some(token) = security_token {
                req = req.header(COOKIE, cookie_header(token));
            }
            req
        })
        .await?;

        if !response.status().is_success() {
            let status = response.status().as_u16();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("Failed to get games (status {}) {}", status, &body[..body.len().min(200)]));
        }

        return response.json().await.map_err(|e| format!("Failed to parse: {}", e));
    }

    let url = format!(
        "https://apis.roblox.com/search-api/omni-search?searchQuery={}&sessionId={}",
        urlencoding::encode(keyword),
        session_id
    );
    let response = send_with_retry(|| {
        let mut req = client.get(&url);
        if let Some(token) = security_token {
            req = req.header(COOKIE, cookie_header(token));
        }
        req
    })
    .await?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Failed to search games (status {}) {}", status, &body[..body.len().min(200)]));
    }

    response.json().await.map_err(|e| format!("Failed to parse: {}", e))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UniversePlace {
    pub id: i64,
    #[serde(default)]
    pub name: String,
}

pub async fn get_universe_places(universe_id: i64, security_token: Option<&str>) -> Result<Vec<UniversePlace>, String> {
    let client = reqwest::Client::new();
    let mut all_places = Vec::new();
    let mut cursor = String::new();

    loop {
        let url = if cursor.is_empty() {
            format!(
                "https://develop.roblox.com/v1/universes/{}/places?sortOrder=Asc&limit=100",
                universe_id
            )
        } else {
            format!(
                "https://develop.roblox.com/v1/universes/{}/places?sortOrder=Asc&limit=100&cursor={}",
                universe_id, cursor
            )
        };

        let mut request = client.get(&url);

        if let Some(token) = security_token {
            request = request.header(COOKIE, cookie_header(token));
        }

        let response = request.send().await.map_err(|e| format!("Request failed: {}", e))?;

        if !response.status().is_success() {
            break;
        }

        let body: serde_json::Value = response.json().await.map_err(|e| format!("Failed to parse: {}", e))?;

        if let Some(data) = body["data"].as_array() {
            for place in data {
                if let Ok(p) = serde_json::from_value::<UniversePlace>(place.clone()) {
                    all_places.push(p);
                }
            }
        }

        match body["nextPageCursor"].as_str() {
            Some(c) if !c.is_empty() => cursor = c.to_string(),
            _ => break,
        }
    }

    Ok(all_places)
}

pub async fn parse_private_server_link_code(
    security_token: &str,
    place_id: i64,
    link_code: &str,
) -> Result<String, String> {
    let csrf = crate::api::auth::get_csrf_token(security_token).await?;
    let client = no_redirect_client();

    let url = format!("https://www.roblox.com/games/{}?privateServerLinkCode={}", place_id, link_code);

    let response = client
        .get(&url)
        .header(COOKIE, cookie_header(security_token))
        .header("X-CSRF-TOKEN", &csrf)
        .header("Referer", "https://www.roblox.com/games/4924922222/Brookhaven-RP")
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if response.status().as_u16() == 200 {
        let body = response.text().await.map_err(|e| format!("Failed to read response: {}", e))?;
        if let Some(code) = extract_access_code(&body) {
            return Ok(code);
        }
    }

    let fallback_url = format!("https://web.roblox.com/games/{}?privateServerLinkCode={}", place_id, link_code);

    let response = client
        .get(&fallback_url)
        .header(COOKIE, cookie_header(security_token))
        .header("X-CSRF-TOKEN", &csrf)
        .header("Referer", "https://www.roblox.com/games/4924922222/Brookhaven-RP")
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if response.status().is_success() {
        let body = response.text().await.map_err(|e| format!("Failed to read response: {}", e))?;
        if let Some(code) = extract_access_code(&body) {
            return Ok(code);
        }
    }

    Err("Failed to parse private server access code".to_string())
}

fn extract_access_code(html: &str) -> Option<String> {
    let marker = "Roblox.GameLauncher.joinPrivateGame(";
    let pos = html.find(marker)?;
    let after = &html[pos + marker.len()..];
    let quote_start = after.find('\'')?;
    let rest = &after[quote_start + 1..];
    let quote_end = rest.find('\'')?;
    Some(rest[..quote_end].to_string())
}

pub async fn join_group(security_token: &str, group_id: i64) -> Result<(), String> {
    let csrf = crate::api::auth::get_csrf_token(security_token).await?;
    let client = reqwest::Client::new();

    let response = client
        .post(format!("https://groups.roblox.com/v1/groups/{}/users", group_id))
        .header(COOKIE, cookie_header(security_token))
        .header("X-CSRF-TOKEN", &csrf)
        .header("Content-Type", "application/json")
        .body("{}")
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if response.status().is_success() {
        Ok(())
    } else {
        let body = response.text().await.unwrap_or_default();
        Err(format!("Failed to join group: {}", body))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserPresence {
    #[serde(rename = "userPresenceType")]
    pub user_presence_type: i32,
    #[serde(rename = "lastLocation", default)]
    pub last_location: String,
    #[serde(rename = "placeId")]
    pub place_id: Option<i64>,
    #[serde(rename = "rootPlaceId")]
    pub root_place_id: Option<i64>,
    #[serde(rename = "gameId")]
    pub game_id: Option<String>,
    #[serde(rename = "universeId")]
    pub universe_id: Option<i64>,
    #[serde(rename = "userId")]
    pub user_id: i64,
    #[serde(rename = "lastOnline", default)]
    pub last_online: String,
}

pub async fn get_presence(user_ids: &[i64]) -> Result<Vec<UserPresence>, String> {
    let client = reqwest::Client::new();

    let response = client
        .post("https://presence.roblox.com/v1/presence/users")
        .json(&serde_json::json!({ "userIds": user_ids }))
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Failed to get presence (status {})", response.status().as_u16()));
    }

    let body: serde_json::Value = response.json().await.map_err(|e| format!("Failed to parse: {}", e))?;

    Ok(body["userPresences"]
        .as_array()
        .map(|arr| arr.iter().filter_map(|v| serde_json::from_value(v.clone()).ok()).collect())
        .unwrap_or_default())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThumbnailRequest {
    #[serde(rename = "requestId")]
    pub request_id: String,
    #[serde(rename = "type", alias = "thumbnailType")]
    pub thumbnail_type: String,
    #[serde(rename = "targetId")]
    pub target_id: i64,
    pub size: String,
    pub format: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThumbnailResponse {
    #[serde(rename = "targetId")]
    pub target_id: i64,
    #[serde(rename = "imageUrl")]
    pub image_url: Option<String>,
    #[serde(rename = "errorCode", default)]
    pub error_code: i32,
    #[serde(rename = "requestId", default)]
    pub request_id: String,
    #[serde(default)]
    pub state: String,
}

pub async fn batch_thumbnails(requests: Vec<ThumbnailRequest>) -> Result<Vec<ThumbnailResponse>, String> {
    if requests.is_empty() {
        return Ok(Vec::new());
    }

    let client = reqwest::Client::new();
    let mut all_results = Vec::new();

    for chunk in requests.chunks(100) {
        let response = send_with_retry(|| {
            client
                .post("https://thumbnails.roblox.com/v1/batch")
                .json(&chunk)
        })
        .await?;

        if !response.status().is_success() {
            return Err(format!("Batch request failed (status {})", response.status().as_u16()));
        }

        let body: serde_json::Value = response.json().await.map_err(|e| format!("Failed to parse: {}", e))?;

        if let Some(data) = body["data"].as_array() {
            for item in data {
                if let Ok(t) = serde_json::from_value::<ThumbnailResponse>(item.clone()) {
                    all_results.push(t);
                }
            }
        }
    }

    Ok(all_results)
}

pub async fn get_avatar_headshots(user_ids: &[i64], size: &str) -> Result<Vec<ThumbnailResponse>, String> {
    if user_ids.is_empty() {
        return Ok(Vec::new());
    }

    let client = reqwest::Client::new();
    let ids: String = user_ids.iter().map(|id| id.to_string()).collect::<Vec<_>>().join(",");

    let url = format!(
        "https://thumbnails.roblox.com/v1/users/avatar-headshot?size={}&format=png&userIds={}",
        size, ids
    );
    let response = send_with_retry(|| client.get(&url)).await?;

    if !response.status().is_success() {
        return Err(format!("Failed to get headshots (status {})", response.status().as_u16()));
    }

    let body: serde_json::Value = response.json().await.map_err(|e| format!("Failed to parse: {}", e))?;

    Ok(body["data"]
        .as_array()
        .map(|arr| arr.iter().filter_map(|v| serde_json::from_value(v.clone()).ok()).collect())
        .unwrap_or_default())
}

pub async fn get_asset_thumbnails(
    asset_ids: &[i64],
    size: &str,
    security_token: Option<&str>,
) -> Result<Vec<ThumbnailResponse>, String> {
    if asset_ids.is_empty() {
        return Ok(Vec::new());
    }

    let client = reqwest::Client::new();
    let ids: String = asset_ids.iter().map(|id| id.to_string()).collect::<Vec<_>>().join(",");

    let mut request = client.get(format!(
        "https://thumbnails.roblox.com/v1/assets?assetIds={}&returnPolicy=PlaceHolder&size={}&format=Png&isCircular=false",
        ids, size
    ));

    if let Some(token) = security_token {
        request = request.header(COOKIE, cookie_header(token));
    }

    let response = request.send().await.map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Failed to get asset thumbnails (status {})", response.status().as_u16()));
    }

    let body: serde_json::Value = response.json().await.map_err(|e| format!("Failed to parse: {}", e))?;

    Ok(body["data"]
        .as_array()
        .map(|arr| arr.iter().filter_map(|v| serde_json::from_value(v.clone()).ok()).collect())
        .unwrap_or_default())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetCreator {
    #[serde(rename = "Id")]
    pub id: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetDetails {
    #[serde(rename = "Id")]
    pub id: i64,
    #[serde(rename = "Name", default)]
    pub name: String,
    #[serde(rename = "IsForSale", default)]
    pub is_for_sale: bool,
    #[serde(rename = "PriceInRobux")]
    pub price_in_robux: Option<i64>,
    #[serde(rename = "ProductId")]
    pub product_id: Option<i64>,
    #[serde(rename = "Creator")]
    pub creator: AssetCreator,
}

pub async fn get_asset_details(asset_id: i64, security_token: Option<&str>) -> Result<AssetDetails, String> {
    let client = reqwest::Client::new();

    let mut request = client
        .get(format!("https://economy.roblox.com/v2/assets/{}/details", asset_id))
        .header("Accept", "application/json");

    if let Some(token) = security_token {
        request = request.header(COOKIE, cookie_header(token));
    }

    let response = request.send().await.map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Failed to get asset details (status {})", response.status().as_u16()));
    }

    response.json().await.map_err(|e| format!("Failed to parse asset details: {}", e))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PurchaseResult {
    pub purchased: bool,
    #[serde(rename = "errorMsg")]
    pub error_msg: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
}

pub async fn purchase_product(
    security_token: &str,
    product_id: i64,
    expected_price: i64,
    expected_seller_id: i64,
) -> Result<PurchaseResult, String> {
    let csrf = crate::api::auth::get_csrf_token(security_token).await?;
    let client = reqwest::Client::new();

    let response = client
        .post(format!("https://economy.roblox.com/v1/purchases/products/{}", product_id))
        .header(COOKIE, cookie_header(security_token))
        .header("X-CSRF-Token", &csrf)
        .json(&serde_json::json!({
            "expectedCurrency": 1,
            "expectedPrice": expected_price,
            "expectedSellerId": expected_seller_id,
        }))
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Purchase failed: {}", body));
    }

    response.json().await.map_err(|e| format!("Failed to parse purchase result: {}", e))
}
