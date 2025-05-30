use axum::{
    Json,
    extract::{Path, State},
};
use utoipa::path as route;
use utoipa_axum::{router::OpenApiRouter, routes};
use uuid::Uuid;

#[cfg(feature = "metrics")]
use crate::metrics::*;
use crate::{ApiError, ApiState, Database};

use super::{NewUser, UpdateUser, User};

// create the user router, NOTE: the routes!() macro only supports one route for each METHOD
// if you need multiple routes of the same method, just merge another routes!() macro in.
pub fn router() -> OpenApiRouter<ApiState> {
    OpenApiRouter::new().routes(routes!(get_user, create_user, update_user, delete_user))
}

/// Gets a user by ID
#[route(get, path = "/user/{id}", responses((status = OK, body = User), (status = NOT_FOUND)))]
async fn get_user(Path(id): Path<Uuid>, State(db): State<Database>) -> Result<User, ApiError> {
    #[cfg(feature = "metrics")]
    inc!(REQUEST_COUNT for [Method::Get, Object::User]);

    let user = db.get_user_by_id(id).await?.ok_or(ApiError::NotFound)?;

    Ok(User {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        username: user.username,
    })
}

/// Creates a user
#[route(post, path = "/user", responses((status = CREATED, body = User), (status = BAD_REQUEST), (status = CONFLICT)))]
async fn create_user(
    State(db): State<Database>,
    Json(new_user): Json<NewUser>,
) -> Result<User, ApiError> {
    #[cfg(feature = "metrics")]
    inc!(REQUEST_COUNT for [Method::Post, Object::User]);

    let user = db
        .create_user(new_user.into())
        .await
        .map_err(|_| ApiError::BadRequest)?;

    Ok(User {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        username: user.username,
    })
}

/// Updates a user by id
#[route(patch, path = "/user/{id}", responses((status = CREATED, body = User), (status = BAD_REQUEST), (status = NOT_FOUND)))]
async fn update_user(
    Path(id): Path<Uuid>,
    State(db): State<Database>,
    Json(update_user): Json<UpdateUser>,
) -> Result<User, ApiError> {
    #[cfg(feature = "metrics")]
    inc!(REQUEST_COUNT for [Method::Patch, Object::User]);

    let user = db.update_user(id, update_user.into()).await?;

    Ok(User {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        username: user.username,
    })
}

/// Deletes a user by id
#[route(delete, path = "/user/{id}", responses((status = NO_CONTENT), (status = NOT_FOUND), (status = FORBIDDEN)))]
async fn delete_user(Path(id): Path<Uuid>, State(db): State<Database>) -> Result<(), ApiError> {
    #[cfg(feature = "metrics")]
    inc!(REQUEST_COUNT for [Method::Delete, Object::User]);

    db.delete_user(id).await?;

    Ok(())
}
