This directory contains source code for a custom gridFTP authorization module
for the DataFed. The makefile generates a shared library, libdatafed_authz.so,
  that must be deployed and configured for use in the gsi-authz.conf file under
  /etc/grid-security. An example gsi-authz.conf file is provided here.

GridFTP will delegate authorization to this library, which will utilize DataFed
services to provide fine-grain access control to files stored in central DataFed
storage. This library does not provide authentication - this can be done with
the standard gridmap file, or a custom solution.
