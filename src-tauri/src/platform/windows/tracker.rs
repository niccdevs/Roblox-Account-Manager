#[derive(Debug, Clone, Serialize)]
pub struct TrackedProcess {
    pub pid: u32,
    pub user_id: i64,
    pub browser_tracker_id: String,
}

pub struct ProcessTracker {
    instances: Mutex<HashMap<i64, TrackedProcess>>,
    watcher_active: AtomicBool,
    launcher_cancelled: AtomicBool,
    next_account: AtomicBool,
}

impl ProcessTracker {
    pub fn new() -> Self {
        Self {
            instances: Mutex::new(HashMap::new()),
            watcher_active: AtomicBool::new(false),
            launcher_cancelled: AtomicBool::new(false),
            next_account: AtomicBool::new(false),
        }
    }

    pub fn track(&self, user_id: i64, pid: u32, browser_tracker_id: String) {
        if let Ok(mut instances) = self.instances.lock() {
            instances.insert(
                user_id,
                TrackedProcess {
                    pid,
                    user_id,
                    browser_tracker_id,
                },
            );
        }
    }

    pub fn untrack(&self, user_id: i64) {
        if let Ok(mut instances) = self.instances.lock() {
            instances.remove(&user_id);
        }
    }

    pub fn get_pid(&self, user_id: i64) -> Option<u32> {
        self.instances
            .lock()
            .ok()
            .and_then(|i| i.get(&user_id).map(|p| p.pid))
    }

    #[allow(dead_code)]
    pub fn get_tracked_pids(&self) -> Vec<u32> {
        self.instances
            .lock()
            .ok()
            .map(|i| i.values().map(|p| p.pid).collect())
            .unwrap_or_default()
    }

    pub fn get_all(&self) -> Vec<TrackedProcess> {
        self.instances
            .lock()
            .ok()
            .map(|i| i.values().cloned().collect())
            .unwrap_or_default()
    }

    pub fn kill_for_user(&self, user_id: i64) -> bool {
        if let Some(pid) = self.get_pid(user_id) {
            if kill_process(pid).is_ok() {
                let exited = wait_for_process_exit(pid, Duration::from_millis(1200));
                if exited {
                    self.untrack(user_id);
                }
                exited
            } else if !is_roblox_pid_alive(pid) {
                self.untrack(user_id);
                true
            } else {
                false
            }
        } else {
            false
        }
    }

    pub fn kill_for_user_graceful(&self, user_id: i64, timeout_ms: u64) -> bool {
        let Some(pid) = self.get_pid(user_id) else {
            return true;
        };

        let exited = if kill_process(pid).is_ok() {
            wait_for_process_exit(pid, Duration::from_millis(timeout_ms.max(250)))
        } else {
            !is_roblox_pid_alive(pid)
        };

        if exited {
            self.untrack(user_id);
        }

        exited
    }

    pub fn is_watcher_active(&self) -> bool {
        self.watcher_active.load(Ordering::Relaxed)
    }

    pub fn set_watcher_active(&self, active: bool) {
        self.watcher_active.store(active, Ordering::Relaxed);
    }

    pub fn cancel_launch(&self) {
        self.launcher_cancelled.store(true, Ordering::Relaxed);
    }

    pub fn is_launch_cancelled(&self) -> bool {
        self.launcher_cancelled.load(Ordering::Relaxed)
    }

    pub fn reset_launch_cancelled(&self) {
        self.launcher_cancelled.store(false, Ordering::Relaxed);
    }

    pub fn signal_next_account(&self) {
        self.next_account.store(true, Ordering::Relaxed);
    }

    pub fn is_next_account(&self) -> bool {
        self.next_account.load(Ordering::Relaxed)
    }

    pub fn reset_next_account(&self) {
        self.next_account.store(false, Ordering::Relaxed);
    }

    pub fn cleanup_dead_processes(&self) -> Vec<i64> {
        let alive_pids = get_roblox_pids();
        let mut dead_user_ids = Vec::new();

        if let Ok(mut instances) = self.instances.lock() {
            instances.retain(|user_id, process| {
                if alive_pids.contains(&process.pid) {
                    true
                } else {
                    dead_user_ids.push(*user_id);
                    false
                }
            });
        }

        dead_user_ids
    }
}
