use axum::extract::FromRef;
use std::sync::Arc;

pub type Database = Arc<datafed_database::Database>;

#[derive(Clone)]
pub struct ApiState {
    pub db: Database,
}

macro_rules! from_state {
    ($t:ty, $i:ident) => {
        impl FromRef<ApiState> for $t {
            fn from_ref(app_state: &ApiState) -> $t {
                app_state.$i.clone()
            }
        }
    };
}

from_state!(Database, db);
