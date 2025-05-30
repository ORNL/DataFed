use serde::Deserialize;
use zeroize::ZeroizeOnDrop;

use crate::DatabaseError;

pub enum DatabaseConnection {
    Postgres(DatabaseConfig),
    #[cfg(test)]
    Sqlite(String),
}

#[derive(Deserialize, ZeroizeOnDrop, Clone)]
pub struct DatabaseConfig {
    pub url: String,
    pub port: u16,
    pub username: String,
    pub password: String,
}

#[derive(Debug)]
pub struct Database {
    pub conn: sea_orm::DatabaseConnection,
}

impl Database {
    pub async fn new(conn: DatabaseConnection) -> Result<Self, DatabaseError> {
        Ok(Self {
            conn: match conn {
                DatabaseConnection::Postgres(config) => sea_orm::Database::connect(format!(
                    "postgres://{}:{}@{}:{}/kraken",
                    config.username, config.password, config.url, config.port
                ))
                .await
                .map_err(|_| DatabaseError::ConnectionError)?,
                #[cfg(test)]
                DatabaseConnection::Sqlite(s) => sea_orm::Database::connect(s)
                    .await
                    .map_err(|_| DatabaseError::ConnectionError)?,
            },
        })
    }
}

pub async fn create_database(conn: DatabaseConnection) -> Result<Database, DatabaseError> {
    Database::new(conn).await
}

#[cfg(test)]
pub async fn setup_test_db() -> Result<Database, Box<dyn std::error::Error>> {
    use sea_orm_migration::MigratorTrait;

    let db = Database::new(DatabaseConnection::Sqlite(
        std::env::var("DATABASE_URL").unwrap_or("sqlite::memory:".to_string()),
    ))
    .await?;

    crate::Migrator::up(&db.conn, None).await?;

    Ok(db)
}
