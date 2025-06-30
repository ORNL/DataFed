#!/bin/bash
# Check system dependencies for Globus Connect Server configuration

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=== Checking System Dependencies ==="
echo

# Track if all dependencies are met
ALL_GOOD=true

# Function to check if a command exists
check_command() {
    local cmd=$1
    local name=$2
    local install_hint=$3
    
    if command -v "$cmd" &> /dev/null; then
        echo -e "${GREEN}✓${NC} $name found: $(command -v "$cmd")"
        return 0
    else
        echo -e "${RED}✗${NC} $name not found"
        echo "  Install hint: $install_hint"
        ALL_GOOD=false
        return 1
    fi
}

# Function to check Python package
check_python_package() {
    local package=$1
    local import_name=${2:-$package}
    
    if python3 -c "import $import_name" &> /dev/null; then
        # shellcheck disable=SC2155
        local version=$(python3 -c "import $import_name; print(getattr($import_name, '__version__', 'unknown'))" 2>/dev/null || echo "installed")
        echo -e "${GREEN}✓${NC} Python package '$package' found: $version"
        return 0
    else
        echo -e "${RED}✗${NC} Python package '$package' not found"
        echo "  Install hint: pip3 install $package"
        ALL_GOOD=false
        return 1
    fi
}

# Function to check Docker daemon
check_docker_daemon() {
    if docker info &> /dev/null; then
        echo -e "${GREEN}✓${NC} Docker daemon is running"
        return 0
    else
        echo -e "${RED}✗${NC} Docker daemon is not running or not accessible"
        echo "  Hint: Make sure Docker is started and you have permissions"
        ALL_GOOD=false
        return 1
    fi
}

# Function to check network connectivity
check_network() {
    local host=$1
    local name=$2
    
    if curl -s --head --fail "https://$host" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Network connectivity to $name confirmed"
        return 0
    else
        echo -e "${YELLOW}⚠${NC} Could not reach $name (may be blocked by firewall)"
        return 1
    fi
}

# Check system commands
echo "Checking system commands..."
check_command "docker" "Docker" "Visit https://docs.docker.com/get-docker/"

# Special check for Docker Compose (V2 is a docker subcommand)
if docker compose version &> /dev/null; then
    echo -e "${GREEN}✓${NC} Docker Compose found: $(docker compose version)"
elif command -v docker-compose &> /dev/null; then
    echo -e "${GREEN}✓${NC} Docker Compose found: $(docker-compose --version)"
else
    echo -e "${RED}✗${NC} Docker Compose not found"
    echo "  Install hint: Visit https://docs.docker.com/compose/install/"
    ALL_GOOD=false
fi
check_command "python3" "Python 3" "apt-get install python3 (Ubuntu) or visit https://www.python.org/"
check_command "pip3" "pip3" "apt-get install python3-pip (Ubuntu) or python3 -m ensurepip"
check_command "git" "Git" "apt-get install git (Ubuntu) or visit https://git-scm.com/"
check_command "curl" "curl" "apt-get install curl (Ubuntu)"
check_command "jq" "jq (recommended)" "apt-get install jq (Ubuntu)" || true

echo

# Check Docker daemon
echo "Checking Docker daemon..."
check_docker_daemon

echo

# Check Python packages
echo "Checking Python packages..."
check_python_package "globus_sdk" "globus_sdk"

echo

# Check Python version
echo "Checking Python version..."
PYTHON_VERSION=$(python3 -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
PYTHON_MAJOR=$(echo "$PYTHON_VERSION" | cut -d. -f1)
PYTHON_MINOR=$(echo "$PYTHON_VERSION" | cut -d. -f2)

if [ "$PYTHON_MAJOR" -ge 3 ] && [ "$PYTHON_MINOR" -ge 6 ]; then
    echo -e "${GREEN}✓${NC} Python version $PYTHON_VERSION (>= 3.6 required)"
else
    echo -e "${RED}✗${NC} Python version $PYTHON_VERSION is too old (>= 3.6 required)"
    ALL_GOOD=false
fi

echo

# Check network connectivity
echo "Checking network connectivity..."
check_network "globus.org" "Globus"
check_network "app.globus.org" "Globus App"
check_network "downloads.globus.org" "Globus Downloads"

echo

# Check if running inside DataFed repository
echo "Checking repository structure..."
if [ -d "$(dirname "${BASH_SOURCE[0]}")/../../external/globus-connect-server-deploy" ]; then
    echo -e "${GREEN}✓${NC} Running within DataFed repository structure"
    echo "  Will use external/globus-connect-server-deploy for builds"
else
    echo -e "${YELLOW}⚠${NC} Not running within DataFed repository"
    echo "  Will use standalone build mode (downloads from GitHub)"
fi

echo

# Summary
if [ "$ALL_GOOD" = true ]; then
    echo -e "${GREEN}=== All required dependencies are installed ===${NC}"
    echo
    echo "Next steps:"
    echo "1. Copy and configure .env file:"
    echo "   cp .env.template .env"
    echo "   vim .env"
    echo
    echo "2. Initialize Globus credentials:"
    echo "   ./bin/init-credentials.sh" 
    echo
    echo "3. Build Docker images:"
    echo "   ./bin/build.sh"
else
    echo -e "${RED}=== Some dependencies are missing ===${NC}"
    echo
    echo "Please install the missing dependencies before proceeding."
    echo "For Python packages, you can run:"
    echo "  pip3 install -r docker/requirements.txt"
    exit 1
fi