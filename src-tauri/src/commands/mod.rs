pub mod engine;
pub mod protocol;
pub mod settings;
pub mod tasks;
pub mod torrent;
pub mod trackers;
pub mod updater;
pub mod window;

use sqlx::SqlitePool;

use crate::commands::engine::EngineState;

pub struct AppState {
    pub pool: SqlitePool,
    pub engine: EngineState,
}

impl AppState {
    pub fn new(pool: SqlitePool, engine: EngineState) -> Self {
        Self { pool, engine }
    }
}
