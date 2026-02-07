use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use cookie::Cookie;
use tauri::{AppHandle, Emitter, Manager, Url, WebviewUrl, WebviewWindowBuilder};

use crate::data::accounts::AccountStore;

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
    .title("Roblox Login")
    .inner_size(900.0, 720.0)
    .center()
    .on_navigation(move |url| {
        if let Some(host) = url.host_str() {
            let path = url.path();
            let is_roblox = host == "www.roblox.com"
                || host == "web.roblox.com"
                || host == "roblox.com";
            let is_home = path == "/home"
                || path.starts_with("/home/")
                || path.starts_with("/discover")
                || path == "/";

            if is_roblox
                && is_home
                && path != "/login"
                && !detected_clone.swap(true, Ordering::SeqCst)
            {
                app_clone.emit("browser-login-detected", ()).ok();
            }
        }
        true
    })
    .build()
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn extract_browser_cookie(app: AppHandle) -> Result<String, String> {
    let browser = app
        .get_webview_window("login-browser")
        .ok_or("Browser window not found")?;

    let url: Url = "https://www.roblox.com".parse().unwrap();
    let cookies = browser.cookies_for_url(url).map_err(|e| e.to_string())?;

    let cookie = cookies
        .iter()
        .find(|c| c.name() == ".ROBLOSECURITY")
        .ok_or("No .ROBLOSECURITY cookie found. Make sure you completed the login.")?;

    Ok(cookie.value().to_string())
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

    let security_token = account.security_token.clone();
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

    let cookie = Cookie::build((".ROBLOSECURITY", security_token))
        .domain(".roblox.com")
        .path("/")
        .secure(true)
        .http_only(true)
        .build();

    browser.set_cookie(cookie).map_err(|e| e.to_string())?;
    browser
        .eval("window.location.href = 'https://www.roblox.com/home'")
        .map_err(|e| e.to_string())?;

    Ok(())
}
