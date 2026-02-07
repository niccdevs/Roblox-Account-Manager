use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};
use std::path::PathBuf;
use std::fs;

use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tauri::Emitter;
use tokio::net::TcpListener;
use tokio::sync::mpsc;

static NEXUS: LazyLock<NexusServer> = LazyLock::new(NexusServer::new);

pub fn nexus() -> &'static NexusServer {
    &NEXUS
}

pub struct NexusServer {
    connections: Mutex<HashMap<String, NexusConnection>>,
    accounts: Mutex<Vec<ControlledAccount>>,
    custom_elements: Mutex<Vec<CustomElement>>,
    log_messages: Mutex<Vec<String>>,
    server_handle: Mutex<Option<ServerHandle>>,
}

struct ServerHandle {
    shutdown: tokio::sync::watch::Sender<bool>,
    port: u16,
}

struct NexusConnection {
    sender: mpsc::UnboundedSender<String>,
    username: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ControlledAccount {
    #[serde(rename = "Username")]
    pub username: String,
    #[serde(rename = "AutoExecute", default)]
    pub auto_execute: String,
    #[serde(rename = "PlaceId", default)]
    pub place_id: i64,
    #[serde(rename = "JobId", default)]
    pub job_id: String,
    #[serde(rename = "RelaunchDelay", default = "default_relaunch_delay")]
    pub relaunch_delay: f64,
    #[serde(rename = "AutoRelaunch", default)]
    pub auto_relaunch: bool,
    #[serde(rename = "IsChecked", default)]
    pub is_checked: bool,
    #[serde(skip)]
    pub status: AccountStatus,
    #[serde(skip)]
    pub last_ping: Option<Instant>,
    #[serde(skip)]
    pub in_game_job_id: String,
    #[serde(skip)]
    pub client_can_receive: bool,
}

fn default_relaunch_delay() -> f64 {
    30.0
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AccountStatus {
    Online,
    Offline,
}

impl Default for AccountStatus {
    fn default() -> Self {
        AccountStatus::Offline
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomElement {
    pub name: String,
    pub element_type: String,
    pub content: String,
    pub size: Option<(i32, i32)>,
    pub margin: Option<(i32, i32, i32, i32)>,
    pub decimal_places: Option<i32>,
    pub increment: Option<String>,
    pub value: String,
    pub is_newline: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NexusStatus {
    pub running: bool,
    pub port: Option<u16>,
    pub connected_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountView {
    pub username: String,
    pub auto_execute: String,
    pub place_id: i64,
    pub job_id: String,
    pub relaunch_delay: f64,
    pub auto_relaunch: bool,
    pub is_checked: bool,
    pub status: String,
    pub in_game_job_id: String,
}

#[derive(Deserialize)]
struct Command {
    #[serde(rename = "Name")]
    name: String,
    #[serde(rename = "Payload")]
    payload: Option<HashMap<String, String>>,
}

impl NexusServer {
    fn new() -> Self {
        let server = Self {
            connections: Mutex::new(HashMap::new()),
            accounts: Mutex::new(Vec::new()),
            custom_elements: Mutex::new(Vec::new()),
            log_messages: Mutex::new(Vec::new()),
            server_handle: Mutex::new(None),
        };
        server.load_accounts();
        server
    }

    fn data_path() -> PathBuf {
        std::env::current_exe()
            .unwrap_or_default()
            .parent()
            .unwrap_or(std::path::Path::new("."))
            .join("AccountControlData.json")
    }

    fn load_accounts(&self) {
        let path = Self::data_path();
        if path.exists() {
            if let Ok(data) = fs::read_to_string(&path) {
                if let Ok(accounts) = serde_json::from_str::<Vec<ControlledAccount>>(&data) {
                    let mut lock = self.accounts.lock().unwrap();
                    *lock = accounts;
                }
            }
        }
    }

    fn save_accounts(&self) {
        let accounts = self.accounts.lock().unwrap();
        let path = Self::data_path();
        if let Ok(json) = serde_json::to_string_pretty(&*accounts) {
            let _ = fs::write(path, json);
        }
    }

    pub fn is_running(&self) -> bool {
        self.server_handle.lock().unwrap().is_some()
    }

    pub fn get_port(&self) -> Option<u16> {
        self.server_handle
            .lock()
            .unwrap()
            .as_ref()
            .map(|h| h.port)
    }

    pub fn get_status(&self) -> NexusStatus {
        let handle = self.server_handle.lock().unwrap();
        let conns = self.connections.lock().unwrap();
        NexusStatus {
            running: handle.is_some(),
            port: handle.as_ref().map(|h| h.port),
            connected_count: conns.len(),
        }
    }

    pub fn get_accounts(&self) -> Vec<AccountView> {
        let accounts = self.accounts.lock().unwrap();
        accounts
            .iter()
            .map(|a| AccountView {
                username: a.username.clone(),
                auto_execute: a.auto_execute.clone(),
                place_id: a.place_id,
                job_id: a.job_id.clone(),
                relaunch_delay: a.relaunch_delay,
                auto_relaunch: a.auto_relaunch,
                is_checked: a.is_checked,
                status: if a.status == AccountStatus::Online {
                    "Online".into()
                } else {
                    "Offline".into()
                },
                in_game_job_id: a.in_game_job_id.clone(),
            })
            .collect()
    }

    pub fn add_account(&self, username: &str) -> Result<(), String> {
        let mut accounts = self.accounts.lock().unwrap();
        if accounts.iter().any(|a| a.username == username) {
            return Err(format!("{} is already in the control list", username));
        }
        accounts.push(ControlledAccount {
            username: username.to_string(),
            auto_execute: String::new(),
            place_id: 0,
            job_id: String::new(),
            relaunch_delay: 30.0,
            auto_relaunch: false,
            is_checked: false,
            status: AccountStatus::Offline,
            last_ping: None,
            in_game_job_id: String::new(),
            client_can_receive: false,
        });
        drop(accounts);
        self.save_accounts();
        Ok(())
    }

    pub fn remove_accounts(&self, usernames: &[String]) {
        let mut accounts = self.accounts.lock().unwrap();
        accounts.retain(|a| !usernames.contains(&a.username));
        drop(accounts);
        self.save_accounts();
    }

    pub fn update_account(&self, update: AccountView) {
        let mut accounts = self.accounts.lock().unwrap();
        if let Some(account) = accounts.iter_mut().find(|a| a.username == update.username) {
            account.auto_execute = update.auto_execute;
            account.place_id = update.place_id;
            account.job_id = update.job_id;
            account.relaunch_delay = update.relaunch_delay;
            account.auto_relaunch = update.auto_relaunch;
            account.is_checked = update.is_checked;
        }
        drop(accounts);
        self.save_accounts();
    }

    pub fn send_command(&self, message: &str) {
        let accounts = self.accounts.lock().unwrap();
        let conns = self.connections.lock().unwrap();

        for account in accounts.iter() {
            if account.is_checked && account.status == AccountStatus::Online {
                if let Some(conn) = conns.get(&account.username) {
                    let _ = conn.sender.send(message.to_string());
                }
            }
        }
    }

    pub fn send_to_all(&self, message: &str) {
        let conns = self.connections.lock().unwrap();
        for conn in conns.values() {
            let _ = conn.sender.send(message.to_string());
        }
    }

    pub fn get_log(&self) -> Vec<String> {
        self.log_messages.lock().unwrap().clone()
    }

    pub fn clear_log(&self) {
        self.log_messages.lock().unwrap().clear();
    }

    pub fn get_elements(&self) -> Vec<CustomElement> {
        self.custom_elements.lock().unwrap().clone()
    }

    pub fn set_element_value(&self, name: &str, value: &str) {
        let mut elements = self.custom_elements.lock().unwrap();
        if let Some(el) = elements.iter_mut().find(|e| e.name == name) {
            el.value = value.to_string();
        }
    }

    pub fn get_element_text(&self, name: &str) -> String {
        let elements = self.custom_elements.lock().unwrap();
        elements
            .iter()
            .find(|e| e.name == name)
            .map(|e| e.value.clone())
            .unwrap_or_default()
    }

    fn handle_message(&self, username: &str, raw: &str, app: Option<&tauri::AppHandle>) {
        if raw.is_empty() {
            return;
        }

        let command: Command = match serde_json::from_str(raw) {
            Ok(c) => c,
            Err(_) => return,
        };

        let payload = command.payload.unwrap_or_default();

        match command.name.as_str() {
            "ping" => {
                let mut accounts = self.accounts.lock().unwrap();
                if let Some(account) = accounts.iter_mut().find(|a| a.username == username) {
                    account.last_ping = Some(Instant::now());
                    account.client_can_receive = true;
                }
            }
            "Log" => {
                if let Some(content) = payload.get("Content") {
                    self.log_messages.lock().unwrap().push(content.clone());
                    if let Some(app) = app {
                        let _ = app.emit("nexus-log", serde_json::json!({ "message": content }));
                    }
                }
            }
            "GetText" => {
                if let Some(name) = payload.get("Name") {
                    let text = self.get_element_text(name);
                    let conns = self.connections.lock().unwrap();
                    if let Some(conn) = conns.get(username) {
                        let _ = conn.sender.send(format!("ElementText:{}", text));
                    }
                }
            }
            "SetRelaunch" => {
                if let Some(seconds) = payload.get("Seconds").and_then(|s| s.parse::<f64>().ok()) {
                    let mut accounts = self.accounts.lock().unwrap();
                    if let Some(account) = accounts.iter_mut().find(|a| a.username == username) {
                        account.relaunch_delay = seconds;
                    }
                    drop(accounts);
                    self.save_accounts();
                }
            }
            "SetAutoRelaunch" => {
                if let Some(val) = payload.get("Content").and_then(|s| s.parse::<bool>().ok()) {
                    let mut accounts = self.accounts.lock().unwrap();
                    if let Some(account) = accounts.iter_mut().find(|a| a.username == username) {
                        account.auto_relaunch = val;
                    }
                    drop(accounts);
                    self.save_accounts();
                }
            }
            "SetPlaceId" => {
                if let Some(pid) = payload.get("Content").and_then(|s| s.parse::<i64>().ok()) {
                    let mut accounts = self.accounts.lock().unwrap();
                    if let Some(account) = accounts.iter_mut().find(|a| a.username == username) {
                        account.place_id = pid;
                    }
                    drop(accounts);
                    self.save_accounts();
                }
            }
            "SetJobId" => {
                if let Some(content) = payload.get("Content") {
                    let mut accounts = self.accounts.lock().unwrap();
                    if let Some(account) = accounts.iter_mut().find(|a| a.username == username) {
                        account.job_id = content.clone();
                    }
                    drop(accounts);
                    self.save_accounts();
                }
            }
            "Echo" => {
                if let Some(content) = payload.get("Content") {
                    self.send_to_all(content);
                }
            }
            "CreateButton" | "CreateTextBox" | "CreateNumeric" | "CreateLabel" => {
                let name = match payload.get("Name") {
                    Some(n) => n.clone(),
                    None => return,
                };
                let content = payload.get("Content").cloned().unwrap_or_default();

                let mut elements = self.custom_elements.lock().unwrap();
                if elements.iter().any(|e| e.name == name) {
                    return;
                }

                let size = payload.get("Size").and_then(|s| {
                    let parts: Vec<i32> = s.split(',').filter_map(|p| p.trim().parse().ok()).collect();
                    if parts.len() == 2 {
                        Some((parts[0], parts[1]))
                    } else {
                        None
                    }
                });

                let margin = payload.get("Margin").and_then(|s| {
                    let parts: Vec<i32> = s.split(',').filter_map(|p| p.trim().parse().ok()).collect();
                    if parts.len() == 4 {
                        Some((parts[0], parts[1], parts[2], parts[3]))
                    } else {
                        None
                    }
                });

                let decimal_places = payload
                    .get("DecimalPlaces")
                    .and_then(|s| s.parse().ok());
                let increment = payload.get("Increment").cloned();

                let element = CustomElement {
                    name: name.clone(),
                    element_type: command.name.replace("Create", ""),
                    content: content.clone(),
                    size,
                    margin,
                    decimal_places,
                    increment,
                    value: content,
                    is_newline: false,
                };

                elements.push(element.clone());
                drop(elements);

                if let Some(app) = app {
                    let _ = app.emit(
                        "nexus-element-created",
                        serde_json::json!({
                            "name": name,
                            "elementType": element.element_type,
                            "content": element.content,
                        }),
                    );
                }
            }
            "NewLine" => {
                let mut elements = self.custom_elements.lock().unwrap();
                let idx = elements.len();
                elements.push(CustomElement {
                    name: format!("__newline_{}", idx),
                    element_type: "NewLine".to_string(),
                    content: String::new(),
                    size: None,
                    margin: None,
                    decimal_places: None,
                    increment: None,
                    value: String::new(),
                    is_newline: true,
                });
                drop(elements);

                if let Some(app) = app {
                    let _ = app.emit("nexus-element-newline", serde_json::json!({}));
                }
            }
            _ => {}
        }
    }

    pub async fn start(&self, port: u16, allow_external: bool, app: tauri::AppHandle) -> Result<u16, String> {
        if self.is_running() {
            return Err("Nexus server is already running".into());
        }

        let addr = if allow_external {
            format!("0.0.0.0:{}", port)
        } else {
            format!("127.0.0.1:{}", port)
        };

        let listener = TcpListener::bind(&addr)
            .await
            .map_err(|e| format!("Failed to bind port {}: {}", port, e))?;

        let actual_port = listener
            .local_addr()
            .map_err(|e| format!("Failed to get local addr: {}", e))?
            .port();

        let (shutdown_tx, shutdown_rx) = tokio::sync::watch::channel(false);

        {
            let mut handle = self.server_handle.lock().unwrap();
            *handle = Some(ServerHandle {
                shutdown: shutdown_tx,
                port: actual_port,
            });
        }

        let app_clone = app.clone();
        let mut shutdown_rx_clone = shutdown_rx.clone();

        tokio::spawn(async move {
            loop {
                tokio::select! {
                    result = listener.accept() => {
                        match result {
                            Ok((stream, _addr)) => {
                                let app = app_clone.clone();
                                let shutdown = shutdown_rx.clone();
                                tokio::spawn(handle_connection(stream, app, shutdown));
                            }
                            Err(_) => break,
                        }
                    }
                    _ = shutdown_rx_clone.changed() => {
                        if *shutdown_rx_clone.borrow() {
                            break;
                        }
                    }
                }
            }
        });

        Ok(actual_port)
    }

    pub fn stop(&self) {
        let mut handle = self.server_handle.lock().unwrap();
        if let Some(h) = handle.take() {
            let _ = h.shutdown.send(true);
        }

        let mut conns = self.connections.lock().unwrap();
        conns.clear();

        let mut accounts = self.accounts.lock().unwrap();
        for account in accounts.iter_mut() {
            account.status = AccountStatus::Offline;
            account.client_can_receive = false;
        }
    }
}

async fn handle_connection(
    stream: tokio::net::TcpStream,
    app: tauri::AppHandle,
    mut shutdown: tokio::sync::watch::Receiver<bool>,
) {
    let mut uri_path = String::new();

    let ws_stream = match tokio_tungstenite::accept_hdr_async(
        stream,
        |req: &tokio_tungstenite::tungstenite::handshake::server::Request,
         res: tokio_tungstenite::tungstenite::handshake::server::Response| {
            uri_path = req.uri().to_string();
            Ok(res)
        },
    )
    .await
    {
        Ok(ws) => ws,
        Err(_) => return,
    };

    let params = parse_query_params(&uri_path);

    let name = match params.get("name") {
        Some(n) if !n.is_empty() => n.clone(),
        _ => return,
    };

    let id_str = match params.get("id") {
        Some(i) if !i.is_empty() => i.clone(),
        _ => return,
    };

    if id_str.parse::<i64>().is_err() {
        return;
    }

    let job_id = params
        .get("jobId")
        .cloned()
        .unwrap_or_else(|| "UNKNOWN".to_string());

    let server = nexus();

    {
        let accounts = server.accounts.lock().unwrap();
        if !accounts.iter().any(|a| a.username == name) {
            return;
        }
    }

    {
        let mut accounts = server.accounts.lock().unwrap();
        if let Some(account) = accounts.iter_mut().find(|a| a.username == name) {
            account.status = AccountStatus::Online;
            account.last_ping = Some(Instant::now());
            account.in_game_job_id = job_id;
            account.client_can_receive = false;
        }
    }

    let (tx, mut rx) = mpsc::unbounded_channel::<String>();

    {
        let mut conns = server.connections.lock().unwrap();
        conns.insert(
            name.clone(),
            NexusConnection {
                sender: tx,
                username: name.clone(),
            },
        );
    }

    let _ = app.emit(
        "nexus-account-connected",
        serde_json::json!({ "username": &name }),
    );

    let auto_exec = {
        let accounts = server.accounts.lock().unwrap();
        accounts
            .iter()
            .find(|a| a.username == name)
            .map(|a| a.auto_execute.clone())
            .unwrap_or_default()
    };

    if !auto_exec.is_empty() {
        let auto_exec_msg = format!("execute {}", auto_exec);
        let name_clone = name.clone();
        let tx_clone = {
            let conns = server.connections.lock().unwrap();
            conns.get(&name_clone).map(|c| c.sender.clone())
        };
        if let Some(sender) = tx_clone {
            tokio::spawn(async move {
                loop {
                    let ready = {
                        let accounts = nexus().accounts.lock().unwrap();
                        accounts
                            .iter()
                            .find(|a| a.username == name_clone)
                            .map(|a| a.client_can_receive)
                            .unwrap_or(false)
                    };
                    if ready {
                        let _ = sender.send(auto_exec_msg);
                        break;
                    }
                    tokio::time::sleep(Duration::from_millis(80)).await;
                }
            });
        }
    }

    let (mut ws_write, mut ws_read) = ws_stream.split();

    let username_clone = name.clone();
    let app_clone = app.clone();

    loop {
        tokio::select! {
            msg = ws_read.next() => {
                match msg {
                    Some(Ok(tokio_tungstenite::tungstenite::Message::Text(text))) => {
                        server.handle_message(&username_clone, &text, Some(&app_clone));
                    }
                    Some(Ok(tokio_tungstenite::tungstenite::Message::Close(_))) | None => break,
                    Some(Err(_)) => break,
                    _ => {}
                }
            }
            outgoing = rx.recv() => {
                match outgoing {
                    Some(msg) => {
                        if ws_write.send(tokio_tungstenite::tungstenite::Message::Text(msg.into())).await.is_err() {
                            break;
                        }
                    }
                    None => break,
                }
            }
            _ = shutdown.changed() => {
                if *shutdown.borrow() {
                    break;
                }
            }
        }
    }

    {
        let mut conns = server.connections.lock().unwrap();
        conns.remove(&name);
    }

    {
        let mut accounts = server.accounts.lock().unwrap();
        if let Some(account) = accounts.iter_mut().find(|a| a.username == name) {
            account.status = AccountStatus::Offline;
            account.client_can_receive = false;
        }
    }

    let _ = app.emit(
        "nexus-account-disconnected",
        serde_json::json!({ "username": &name }),
    );
}

fn parse_query_params(uri: &str) -> HashMap<String, String> {
    let mut params = HashMap::new();
    if let Some(query) = uri.split('?').nth(1) {
        for pair in query.split('&') {
            let mut parts = pair.splitn(2, '=');
            if let (Some(key), Some(value)) = (parts.next(), parts.next()) {
                params.insert(
                    urlencoding::decode(key).unwrap_or_default().into_owned(),
                    urlencoding::decode(value).unwrap_or_default().into_owned(),
                );
            }
        }
    }
    params
}
