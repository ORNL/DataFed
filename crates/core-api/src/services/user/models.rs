use datafed_database::user;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Serialize, Deserialize, ToSchema)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub username: Option<String>,
}

#[derive(Serialize, Deserialize, ToSchema)]
pub struct NewUser {
    pub email: String,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub username: Option<String>,
}

#[derive(Serialize, Deserialize, ToSchema)]
pub struct UpdateUser {
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub username: Option<String>,
}

impl From<NewUser> for user::NewModel {
    fn from(val: NewUser) -> Self {
        Self {
            email: val.email,
            first_name: val.first_name,
            last_name: val.last_name,
            username: val.username,
        }
    }
}

impl From<UpdateUser> for user::UpdateModel {
    fn from(val: UpdateUser) -> Self {
        Self {
            email: None,
            first_name: val.first_name,
            last_name: val.last_name,
            username: val.username,
        }
    }
}

impl axum::response::IntoResponse for User {
    fn into_response(self) -> axum::response::Response {
        axum::response::Json(self).into_response()
    }
}
