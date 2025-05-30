mod m20250529_000001_create_user;

use async_trait::async_trait;
pub use sea_orm_migration::*;

pub struct Migrator;

#[async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![Box::new(m20250529_000001_create_user::Migration)]
    }
}

pub async fn run_migrator() {
    cli::run_cli(Migrator).await
}
