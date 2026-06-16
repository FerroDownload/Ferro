use std::sync::{Arc, Mutex};

use ferro_lib::commands::tasks;

#[derive(Clone, Debug, PartialEq, Eq)]
enum GlobalCall {
    ForcePauseAll,
    UnpauseAll,
}

#[derive(Clone)]
struct RecordingGlobalClient {
    calls: Arc<Mutex<Vec<GlobalCall>>>,
}

impl RecordingGlobalClient {
    fn new() -> Self {
        Self {
            calls: Arc::new(Mutex::new(Vec::new())),
        }
    }

    fn calls(&self) -> Vec<GlobalCall> {
        self.calls.lock().expect("calls").clone()
    }
}

impl tasks::QueueGlobalRpcClient for RecordingGlobalClient {
    fn force_pause_all(&self) -> tasks::QueueGlobalFuture<'_> {
        let calls = Arc::clone(&self.calls);
        Box::pin(async move {
            calls.lock().expect("calls").push(GlobalCall::ForcePauseAll);
            Ok(())
        })
    }

    fn unpause_all(&self) -> tasks::QueueGlobalFuture<'_> {
        let calls = Arc::clone(&self.calls);
        Box::pin(async move {
            calls.lock().expect("calls").push(GlobalCall::UnpauseAll);
            Ok(())
        })
    }
}

#[test]
fn pause_all_tasks_maps_to_force_pause_all() {
    let runtime = tokio::runtime::Runtime::new().expect("runtime");
    let client = RecordingGlobalClient::new();

    runtime
        .block_on(tasks::pause_all_tasks_with_client(client.clone()))
        .expect("pause all");

    assert_eq!(client.calls(), vec![GlobalCall::ForcePauseAll]);
}

#[test]
fn resume_all_tasks_maps_to_unpause_all() {
    let runtime = tokio::runtime::Runtime::new().expect("runtime");
    let client = RecordingGlobalClient::new();

    runtime
        .block_on(tasks::resume_all_tasks_with_client(client.clone()))
        .expect("resume all");

    assert_eq!(client.calls(), vec![GlobalCall::UnpauseAll]);
}
