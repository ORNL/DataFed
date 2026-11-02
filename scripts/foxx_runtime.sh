#!/bin/bash
# Source after loading datafed.sh and dependency_versions.sh.
datafed_use_foxx_runtime() {
  local datafed_project_root="$1"
  export NVM_DIR="${DATAFED_DEPENDENCIES_INSTALL_PATH}/nvm"
  if [ -x "${DATAFED_DEPENDENCIES_INSTALL_PATH}/npm/bin/foxx" ]; then
    if [ ! -s "$NVM_DIR/nvm.sh" ] || [ ! -x "$NVM_DIR/versions/node/$DATAFED_NODE_VERSION/bin/node" ]; then
      echo "ERROR - The preinstalled Foxx CLI requires Node $DATAFED_NODE_VERSION and nvm.sh" >&2
      return 1
    fi
    . "$NVM_DIR/nvm.sh"
    nvm use "$DATAFED_NODE_VERSION"
  else
    # Preserve installation for bare-metal deployments. Keep the installer
    # library's path variables local so callers retain their own script paths.
    local SCRIPT SOURCE PROJECT_ROOT
    source "${datafed_project_root}/external/DataFedDependencies/scripts/dependency_install_functions.sh"
    install_nvm
    install_node
    install_foxx_cli
  fi
}
