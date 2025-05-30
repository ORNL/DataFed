use datafed_database::user;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

/**
 * You will notice that these structs are the same as the ones in the database crate,
 * the reason they are redefined, is that they may not always be the same,
 * I.E. an api user could have a list of settings but in the database that would encompass
 * multiple types/tables so the api will split them up before inserting them into the database,
 * AND defining them separately for the API and database will avoid any problems with progressive
 * schema changes.
 */

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
