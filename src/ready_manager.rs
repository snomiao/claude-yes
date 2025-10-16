use std::sync::Arc;
use tokio::sync::{Notify, RwLock};
use tracing::debug;

pub struct ReadyManager {
    is_ready: Arc<RwLock<bool>>,
    notify: Arc<Notify>,
}

impl ReadyManager {
    pub fn new() -> Self {
        Self {
            is_ready: Arc::new(RwLock::new(false)),
            notify: Arc::new(Notify::new()),
        }
    }

    pub fn ready(&self) {
        // Set ready synchronously to avoid delay
        // Use try_write to avoid blocking
        if let Ok(mut ready) = self.is_ready.try_write() {
            if !*ready {
                *ready = true;
                self.notify.notify_waiters();
                debug!("Shell is ready for input");
            }
        }
    }

    #[allow(dead_code)]
    pub fn unready(&self) {
        if let Ok(mut ready) = self.is_ready.try_write() {
            *ready = false;
            debug!("Shell is not ready for input");
        }
    }

    pub async fn wait(&self) {
        loop {
            let ready = *self.is_ready.read().await;
            if ready {
                break;
            }
            self.notify.notified().await;
        }
    }

    #[allow(dead_code)]
    pub async fn is_ready(&self) -> bool {
        *self.is_ready.read().await
    }
}
