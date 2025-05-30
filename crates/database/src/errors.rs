use thiserror::Error;

#[derive(Error, Debug)]
pub enum DatabaseError {
    #[error("database error")]
    DatabaseError(sea_orm::DbErr),
    #[error("not found")]
    NotFound,
    #[error("bad input")]
    BadInput,
    #[error("could not connect to database")]
    ConnectionError,
    #[error("database setup error")]
    SetupError,
}

pub type DatabaseResult<T> = Result<T, DatabaseError>;

impl From<sea_orm::DbErr> for DatabaseError {
    fn from(value: sea_orm::DbErr) -> Self {
        Self::DatabaseError(value)
    }
}
