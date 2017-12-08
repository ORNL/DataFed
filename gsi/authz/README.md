This directory contains source code for a custom gridFTP authorization module for the SDMS. The makefile generates a shared library, libsdms_gsi_authz.so, that must be deployed and configured for use in the gsi-authz.conf file under /etc/grid-security. An example gsi-authz.conf file is provided here.

GridFTP will delegate authorization to this library, which will utilize SDMS services to provide fine-grain access control to files stored in central SDMS storage. This library does not provide authentication - this can be done with the standard gridmap file, or a custom solution.
