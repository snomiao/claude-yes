use std::future::Future;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use tokio::time::sleep;
use tracing::debug;

pub struct IdleWatcher {
    timeout: Duration,
    last_activity: Arc<RwLock<Instant>>,
}

impl IdleWatcher {
    pub fn new(timeout: Duration) -> Self {
        Self {
            timeout,
            last_activity: Arc::new(RwLock::new(Instant::now())),
        }
    }

    pub async fn ping(&self) {
        let mut last = self.last_activity.write().await;
        *last = Instant::now();
        debug!("Activity detected, resetting idle timer");
    }

    pub async fn watch<F, Fut>(&self, mut on_idle: F)
    where
        F: FnMut() -> Fut + Send + 'static,
        Fut: Future<Output = bool> + Send,
    {
        loop {
            sleep(Duration::from_secs(1)).await;

            let last = *self.last_activity.read().await;
            let elapsed = Instant::now().duration_since(last);

            if elapsed >= self.timeout {
                debug!("Idle timeout reached after {:?}", elapsed);
                if on_idle().await {
                    break;
                }
            }
        }
    }

    #[allow(dead_code)]
    pub async fn is_idle(&self) -> bool {
        let last = *self.last_activity.read().await;
        let elapsed = Instant::now().duration_since(last);
        elapsed >= self.timeout
    }
}