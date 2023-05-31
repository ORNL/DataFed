#!/bin/bash

set -euf -o pipefail

sudo apt update
sudo apt install -y curl git gnupg
curl -LOs https://downloads.globus.org/globus-connect-server/stable/installers/repo/deb/globus-repo_latest_all.deb
sudo dpkg -i globus-repo_latest_all.deb
sudo apt-key add /usr/share/globus-repo/RPM-GPG-KEY-Globus
# Need a second update command after adding the globus GPG key
sudo apt update
sudo apt-get install globus-connect-server54 -y
