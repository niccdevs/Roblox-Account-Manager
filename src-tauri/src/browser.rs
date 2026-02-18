use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use cookie::{Cookie, SameSite};
use tauri::{AppHandle, Emitter, Manager, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::data::accounts::AccountStore;

const ROBLOX_COOKIE_URLS: [&str; 4] = [
    "https://www.roblox.com",
    "https://www.roblox.com/home",
    "https://roblox.com",
    "https://web.roblox.com",
];

fn normalize_security_token(raw: &str) -> String {
    let trimmed = raw.trim();
    let no_name = trimmed
        .strip_prefix(".ROBLOSECURITY=")
        .unwrap_or(trimmed);
    let no_attrs = no_name.split(';').next().unwrap_or(no_name);
    no_attrs.trim_matches('"').trim().to_string()
}

fn has_roblosecurity_cookie(browser: &WebviewWindow, expected_value: &str) -> bool {
    for raw in ROBLOX_COOKIE_URLS {
        if let Ok(url) = raw.parse::<Url>() {
            if let Ok(cookies) = browser.cookies_for_url(url) {
                if cookies.iter().any(|c| {
                    c.name() == ".ROBLOSECURITY"
                        && !c.value().is_empty()
                        && (expected_value.is_empty() || c.value() == expected_value)
                }) {
                    return true;
                }
            }
        }
    }

    false
}

fn find_roblosecurity(app: &AppHandle) -> Option<String> {
    let browser = app.get_webview_window("login-browser")?;

    for raw in ROBLOX_COOKIE_URLS {
        if let Ok(url) = raw.parse::<Url>() {
            if let Ok(cookies) = browser.cookies_for_url(url) {
                if let Some(cookie) = cookies
                    .iter()
                    .find(|c| c.name() == ".ROBLOSECURITY" && !c.value().is_empty())
                {
                    return Some(cookie.value().to_string());
                }
            }
        }
    }

    None
}

#[tauri::command]
pub async fn open_login_browser(app: AppHandle) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window("login-browser") {
        existing.close().map_err(|e| e.to_string())?;
    }

    let detected = Arc::new(AtomicBool::new(false));
    let detected_clone = detected.clone();
    let app_clone = app.clone();

    WebviewWindowBuilder::new(
        &app,
        "login-browser",
        WebviewUrl::External("https://www.roblox.com/login".parse().unwrap()),
    )
    .incognito(true)
    .title("Roblox Login")
    .inner_size(900.0, 720.0)
    .center()
    .on_navigation(move |url| {
        if let Some(host) = url.host_str() {
            let path = url.path();
            let is_roblox = host == "www.roblox.com"
                || host == "web.roblox.com"
                || host == "roblox.com";
            let is_post_auth = path == "/home"
                || path.starts_with("/home/")
                || path.starts_with("/discover")
                || path.starts_with("/games")
                || path.starts_with("/experiences");

            if is_roblox
                && is_post_auth
                && !detected_clone.swap(true, Ordering::SeqCst)
            {
                app_clone.emit("browser-login-detected", ()).ok();
            }
        }
        true
    })
    .build()
    .map_err(|e| e.to_string())?;

    // Some Roblox login flows do not reliably navigate to a post-auth URL.
    // Poll for .ROBLOSECURITY so Browser Login still completes.
    let poll_detected = detected.clone();
    let poll_app = app.clone();
    tauri::async_runtime::spawn(async move {
        for _ in 0..240 {
            if poll_detected.load(Ordering::SeqCst) {
                return;
            }

            tokio::time::sleep(Duration::from_millis(500)).await;

            let Some(_) = poll_app.get_webview_window("login-browser") else {
                return;
            };

            if find_roblosecurity(&poll_app).is_some()
                && !poll_detected.swap(true, Ordering::SeqCst)
            {
                poll_app.emit("browser-login-detected", ()).ok();
                return;
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn extract_browser_cookie(app: AppHandle) -> Result<String, String> {
    find_roblosecurity(&app)
        .ok_or("No .ROBLOSECURITY cookie found. Make sure you completed the login.".to_string())
}

#[tauri::command]
pub async fn close_login_browser(app: AppHandle) -> Result<(), String> {
    if let Some(browser) = app.get_webview_window("login-browser") {
        browser.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn open_account_browser(
    app: AppHandle,
    state: tauri::State<'_, AccountStore>,
    user_id: i64,
) -> Result<(), String> {
    let accounts = state.get_all()?;
    let account = accounts
        .iter()
        .find(|a| a.user_id == user_id)
        .ok_or("Account not found")?;

    let security_token = normalize_security_token(&account.security_token);
    if security_token.is_empty() {
        return Err("Account has no .ROBLOSECURITY token".to_string());
    }

    let username = account.username.clone();
    let label = format!("account-browser-{}", user_id);

    if let Some(existing) = app.get_webview_window(&label) {
        existing.close().map_err(|e| e.to_string())?;
    }

    let browser = WebviewWindowBuilder::new(
        &app,
        &label,
        WebviewUrl::External("about:blank".parse().unwrap()),
    )
    .title(format!("Roblox — {}", username))
    .inner_size(1100.0, 750.0)
    .center()
    .build()
    .map_err(|e| e.to_string())?;

    let base_cookie = Cookie::build((".ROBLOSECURITY", security_token.clone()))
        .domain(".roblox.com")
        .path("/")
        .secure(true)
        .http_only(true)
        .same_site(SameSite::None)
        .build();

    browser.set_cookie(base_cookie).map_err(|e| e.to_string())?;

    // Some runtimes only honor exact-host domain cookies on initial navigation.
    let www_cookie = Cookie::build((".ROBLOSECURITY", security_token.clone()))
        .domain("www.roblox.com")
        .path("/")
        .secure(true)
        .http_only(true)
        .same_site(SameSite::None)
        .build();
    browser.set_cookie(www_cookie).map_err(|e| e.to_string())?;

    for _ in 0..40 {
        if has_roblosecurity_cookie(&browser, &security_token) {
            break;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }

    if !has_roblosecurity_cookie(&browser, &security_token) {
        return Err("Failed to apply .ROBLOSECURITY cookie to browser window".to_string());
    }

    browser
        .eval("window.location.href = 'https://www.roblox.com/home'")
        .map_err(|e| e.to_string())?;

    Ok(())
}
