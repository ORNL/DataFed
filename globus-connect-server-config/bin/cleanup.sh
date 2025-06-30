#!/bin/bash
# Cleanup script for Globus Connect Server
# Provides options to clean up cloud resources, local files, or both

set -euo pipefail

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default options
CLEANUP_CLOUD=false
CLEANUP_LOCAL=false
FORCE=false
BACKUP=true

# Function to display usage
usage() {
    echo "Usage: $0 [OPTIONS]"
    echo
    echo "Options:"
    echo "  --cloud       Clean up Globus cloud resources (endpoint, project, clients)"
    echo "  --local       Clean up local files (containers, volumes, credentials)"
    echo "  --all         Clean up both cloud and local resources"
    echo "  --force       Skip confirmation prompts"
    echo "  --no-backup   Don't create backups before deletion"
    echo "  -h, --help    Display this help message"
    echo
    echo "Examples:"
    echo "  $0 --cloud           # Remove only cloud resources"
    echo "  $0 --local           # Remove only local files"
    echo "  $0 --all --force     # Remove everything without prompts"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --cloud)
            CLEANUP_CLOUD=true
            shift
            ;;
        --local)
            CLEANUP_LOCAL=true
            shift
            ;;
        --all)
            CLEANUP_CLOUD=true
            CLEANUP_LOCAL=true
            shift
            ;;
        --force)
            FORCE=true
            shift
            ;;
        --no-backup)
            BACKUP=false
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            usage
            exit 1
            ;;
    esac
done

# Check if at least one cleanup option is selected
if [ "$CLEANUP_CLOUD" = false ] && [ "$CLEANUP_LOCAL" = false ]; then
    echo -e "${RED}Error: Please specify what to clean up (--cloud, --local, or --all)${NC}"
    usage
    exit 1
fi

# Function to confirm action
confirm() {
    local message="$1"
    if [ "$FORCE" = false ]; then
        echo -e "${YELLOW}${message}${NC}"
        read -p "Are you sure you want to continue? (yes/no): " -r
        echo
        if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
            echo -e "${RED}Cleanup cancelled.${NC}"
            exit 0
        fi
    fi
}

# Function to create backup
create_backup() {
    local source="$1"
    local backup_name="$2"
    
    if [ "$BACKUP" = true ] && [ -e "$source" ]; then
        local backup_dir="${PROJECT_ROOT}/backups"
        local timestamp=$(date +%Y%m%d-%H%M%S)
        local backup_path="${backup_dir}/${backup_name}-${timestamp}"
        
        mkdir -p "$backup_dir"
        echo -e "${BLUE}Creating backup: ${backup_path}${NC}"
        cp -r "$source" "$backup_path"
    fi
}

# Function to clean up cloud resources
cleanup_cloud() {
    echo -e "${BLUE}=== Cleaning Up Globus Cloud Resources ===${NC}"
    
    # Check if credentials exist
    if [ ! -f "${PROJECT_ROOT}/globus/client_cred.json" ]; then
        echo -e "${YELLOW}No client credentials found. Skipping cloud cleanup.${NC}"
        return
    fi
    
    # Load environment variables
    if [ -f "${PROJECT_ROOT}/.env" ]; then
        source "${PROJECT_ROOT}/.env_shell" 2>/dev/null || true
    fi
    
    # Run the Python cleanup script
    cd "$PROJECT_ROOT"
    
    if [ "$FORCE" = true ]; then
        python3 scripts/cleanup-globus.py --force
    else
        python3 scripts/cleanup-globus.py
    fi
}

# Function to clean up local resources
cleanup_local() {
    echo -e "${BLUE}=== Cleaning Up Local Resources ===${NC}"
    
    # Stop Docker containers
    echo -e "${YELLOW}Stopping Docker containers...${NC}"
    cd "$PROJECT_ROOT"
    docker-compose down 2>/dev/null || true
    
    # Remove Docker images
    if docker images | grep -q "globus-connect-server"; then
        echo -e "${YELLOW}Removing Docker images...${NC}"
        docker rmi globus-connect-server:latest 2>/dev/null || true
    fi
    
    # Backup and remove directories
    local dirs_to_remove=("globus" "keys" "logs")
    
    for dir in "${dirs_to_remove[@]}"; do
        if [ -d "${PROJECT_ROOT}/${dir}" ]; then
            create_backup "${PROJECT_ROOT}/${dir}" "$dir"
            echo -e "${YELLOW}Removing ${dir}/ directory...${NC}"
            rm -rf "${PROJECT_ROOT}/${dir}"
        fi
    done
    
    # Backup and remove .env file
    if [ -f "${PROJECT_ROOT}/.env" ]; then
        create_backup "${PROJECT_ROOT}/.env" "env"
        echo -e "${YELLOW}Removing .env file...${NC}"
        rm -f "${PROJECT_ROOT}/.env"
    fi
    
    # Clean up Docker system (optional)
    echo -e "${YELLOW}Cleaning up Docker system...${NC}"
    docker system prune -f || true
}

# Main execution
echo -e "${BLUE}=== Globus Connect Server Cleanup Script ===${NC}"
echo

# Show what will be cleaned up
echo "This script will clean up the following:"
if [ "$CLEANUP_CLOUD" = true ]; then
    echo "  - Globus cloud resources (endpoint, project, clients, groups)"
fi
if [ "$CLEANUP_LOCAL" = true ]; then
    echo "  - Docker containers and images"
    echo "  - Local directories: globus/, keys/, logs/"
    echo "  - Configuration file: .env"
fi

if [ "$BACKUP" = true ] && [ "$CLEANUP_LOCAL" = true ]; then
    echo
    echo -e "${GREEN}Backups will be created in: ${PROJECT_ROOT}/backups/${NC}"
fi

echo

# Confirm action
confirm "This action cannot be undone."

# Perform cleanup
if [ "$CLEANUP_CLOUD" = true ]; then
    cleanup_cloud
    echo
fi

if [ "$CLEANUP_LOCAL" = true ]; then
    cleanup_local
    echo
fi

echo -e "${GREEN}=== Cleanup Complete ===${NC}"

# Show next steps
echo
echo -e "${YELLOW}Next steps:${NC}"
if [ "$CLEANUP_LOCAL" = true ]; then
    echo "- To set up a new GCS instance, run: ./bin/setup.sh"
fi
if [ "$BACKUP" = true ] && [ "$CLEANUP_LOCAL" = true ]; then
    echo "- Backups are stored in: ${PROJECT_ROOT}/backups/"
    echo "- To restore from backup, copy the files back to their original locations"
fi

# Show firewall cleanup reminder
if [ "$CLEANUP_LOCAL" = true ]; then
    echo
    echo -e "${YELLOW}Note: Firewall rules were not modified.${NC}"
    echo "If you opened ports for GCS, you may want to close them:"
    echo "  sudo ufw delete allow 443/tcp"
    echo "  sudo ufw delete allow 2811/tcp"
    echo "  sudo ufw delete allow 50000:51000/tcp"
fi