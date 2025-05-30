use sea_orm::{ActiveModelTrait, ColumnTrait, DeleteResult, EntityTrait, NotSet, QueryFilter, Set};
use uuid::Uuid;

use crate::{Database, DatabaseError, DatabaseResult};

use super::{ActiveModel, Column, Model, NewModel, UpdateModel, User};

impl Database {
    pub async fn get_user_by_id(&self, id: Uuid) -> DatabaseResult<Option<Model>> {
        User::find_by_id(id)
            .one(&self.conn)
            .await
            .map_err(Into::into)
    }

    pub async fn get_user_by_email(&self, email: String) -> DatabaseResult<Option<Model>> {
        User::find()
            .filter(Column::Email.eq(email))
            .one(&self.conn)
            .await
            .map_err(Into::into)
    }

    pub async fn create_user(&self, new_user: NewModel) -> DatabaseResult<Model> {
        let user_id = Uuid::new_v4();
        let mut user = ActiveModel {
            id: Set(user_id),
            email: Set(new_user.email),
            ..Default::default()
        };

        if let Some(first_name) = new_user.first_name {
            user.first_name = Set(Some(first_name));
        }

        if let Some(last_name) = new_user.last_name {
            user.last_name = Set(Some(last_name));
        }

        if let Some(username) = new_user.username {
            user.username = Set(Some(username));
        }

        Ok(User::insert(user).exec_with_returning(&self.conn).await?)
    }

    pub async fn update_user(&self, id: Uuid, input_user: UpdateModel) -> DatabaseResult<Model> {
        let mut user: ActiveModel = self
            .get_user_by_id(id)
            .await?
            .ok_or(DatabaseError::NotFound)?
            .into();

        user.email = input_user.email.map(Set).unwrap_or(NotSet);
        user.first_name = input_user
            .first_name
            .map(|v| Set(Some(v)))
            .unwrap_or(NotSet);
        user.last_name = input_user.last_name.map(|v| Set(Some(v))).unwrap_or(NotSet);
        user.username = input_user.username.map(|v| Set(Some(v))).unwrap_or(NotSet);

        let user = user.update(&self.conn).await?;

        Ok(user)
    }

    pub async fn delete_user(&self, id: Uuid) -> DatabaseResult<DeleteResult> {
        User::delete_by_id(id)
            .exec(&self.conn)
            .await
            .map_err(Into::into)
    }
}
