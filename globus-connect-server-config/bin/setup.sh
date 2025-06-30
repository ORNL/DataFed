#!/bin/bash
# Setup script for Globus Connect Server configuration
# This script checks dependencies and prepares the environment

set -euo pipefail

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Globus Connect Server Configuration Setup ===${NC}"
echo
echo "This script will:"
echo "1. Check system dependencies"
echo "2. Install Python requirements"
echo "3. Verify Docker configuration"
echo "4. Prepare the environment"
echo

# Step 1: Check dependencies
echo -e "${YELLOW}Step 1: Checking system dependencies...${NC}"
if ! "${SCRIPT_DIR}/check-deps.sh"; then
    echo
    echo -e "${RED}Please install missing dependencies and run this script again.${NC}"
    exit 1
fi

echo

# Step 2: Install Python requirements (if needed)
echo -e "${YELLOW}Step 2: Installing Python requirements...${NC}"

# Check if we're in a virtual environment
if [ -z "${VIRTUAL_ENV:-}" ]; then
    echo -e "${YELLOW}Note: Not running in a virtual environment.${NC}"
    echo "Consider creating one with: python3 -m venv venv && source venv/bin/activate"
fi

# Install requirements
if command -v pip3 &> /dev/null; then
    echo "Installing Python packages from requirements.txt..."
    pip3 install -r "${SCRIPT_DIR}/../docker/requirements.txt" || {
        echo -e "${YELLOW}Warning: Some Python packages may require sudo to install globally${NC}"
        echo "You can either:"
        echo "1. Run: sudo pip3 install -r requirements.txt"
        echo "2. Use a virtual environment (recommended)"
        echo "3. Run scripts inside the Docker container (they have all dependencies)"
    }
else
    echo -e "${YELLOW}pip3 not found. Python packages will be available in the Docker container.${NC}"
fi

echo

# Step 3: Create necessary directories
echo -e "${YELLOW}Step 3: Creating necessary directories...${NC}"

# Create directories if they don't exist
for dir in globus keys logs; do
    if [ ! -d "${SCRIPT_DIR}/../$dir" ]; then
        mkdir -p "${SCRIPT_DIR}/../$dir"
        echo "Created directory: $dir/"
    else
        echo "Directory exists: $dir/"
    fi
done

# Step 4: Check for .env file
echo -e "${YELLOW}Step 4: Checking configuration...${NC}"

if [ -f "${SCRIPT_DIR}/../.env" ]; then
    echo -e "${GREEN}✓${NC} Configuration file .env exists"
    echo
    echo -e "${YELLOW}Please review your .env file to ensure all values are correct.${NC}"
else
    if [ -f "${SCRIPT_DIR}/../.env.template" ]; then
        echo -e "${YELLOW}Configuration file .env not found.${NC}"
        echo
        read -p "Would you like to create .env from the template? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            cp "${SCRIPT_DIR}/../.env.template" "${SCRIPT_DIR}/../.env"
            echo -e "${GREEN}Created .env from template${NC}"
            echo
            echo -e "${RED}IMPORTANT: Edit .env with your configuration before proceeding!${NC}"
            echo "Run: vim .env"
        fi
    else
        echo -e "${RED}No .env.template found!${NC}"
        exit 1
    fi
fi

echo

# Step 5: Setup complete
echo -e "${GREEN}=== Setup Complete ===${NC}"
echo
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Configure your .env file (if just created)"
echo "2. Run: ./bin/init-credentials.sh"
echo "3. See README.md for remaining steps"
echo