==============================
Installation and Configuration
==============================

The DataFed client is a Python package that provides both the DataFed command-line-interface (CLI)
and the DataFed Python application programming interface (API) for advanced scripting. The DataFed
client is provided via a Python 3 package and can be used on any operating system where Python 3
is available.


Installation
~~~~~~~~~~~~
DataFed will be available natively within supported facilities and no installation or configuration should be necessary.

However, if you need to use the DataFed CLI from a non-supported facility,
or on a personal computer such as workstation or laptop, please follow this guide:

0. Prerequisites
----------------

1. **Python 3**:

   * The default python environment on most clusters is likely to be python 2.7.
     Therefore, users are recommended to either load a module that provides python 3.
   * Users on personal computers are encouraged to download and install python
     (e.g. via `Miniconda <https://docs.conda.io/en/latest/miniconda.html>`_)
     if an environment is not already available.
2. **Globus Endpoint**: This is necessary if the user needs to upload locally stored files / download data from DataFed repositories.

   * Nearly all high performance computing clusters should already have Globus endpoint already configured.
     Users need not do anything for this prerequisite.
   * Users intending to use the DataFed client to  from other machines would need to install and configure
     `Globus Personal Connect <https://www.globus.org/globus-connect-personal>`_ as described in the
     `Getting Started page <../system/getting_started.html#install-identify-globus-endpoint>`_.

1. Install python package
-------------------------
Like many Python packages, the DataFed CLI is easy to install using Python's ``pip`` tool. For Linux
and Mac OS, the command is as follows::

    pip install --user datafed

And for Windows, the command is::

    pip install -U datafed

Pip will install the DataFed client package and all dependencies, and will also install an executable
``datafed`` command script (to access the CLI) in the configured pip package binary, or "bin" directory.

2. Ensure bin directory is in Path
----------------------------------
.. note::

    The Python bin directory must be included in the executable search path for the DataFed CLI
    command to be accessible.

If you do not see an error when you type ``datafed`` in your terminal, you may skip this step.

If you encounter errors stating that datafed was an unknown command, you would need to add DataFed to your path.

1. First, you would need to find where datafed was installed.
   For example, on some compute clusters, datafed was installed into directories such as ``~/.local/MACHINE_NAME/PREFIXES-anaconda-SUFFIXES/bin``

2. Next, add DataFed to the ``PATH`` variable.

   .. note::

      You may need to add DataFed to the ``PATH`` in your job scripts

Here is an `external guide <https://www.makeuseof.com/python-windows-path/>`_ on adding Python to the ``PATH`` on Windows machines

.. tip::

   On Mac / Linux, if you have write access to the virtual / conda python environment:

   * You would likely not need to use the ``--user`` flag when pip installing DataFed
   * You would also not need to specifically add DataFed to your ``PATH`` as long
     as you load the python environment itself.

3. Basic Configuration
----------------------
1. Type the following command into shell:

   .. code:: bash

       datafed setup

   It will prompt you for your username and password.
2. Enter the credentials you set up when registering for an account on DataFed
   (not your institutional credentials you use to log into the machine)
3. Add the Globus endpoint specific to this machine / file-system as the default endpoint via:

   .. code:: bash

      datafed ep default set endpoint_name_here

4. (Optional) If you are using Globus Connect Personal, visit the Settings or Preferences
   of the application to inspect which folders Globus has write access to.
   Consider adding or removing directories to suit your needs.

This concludes the one-time setup necessary to get started with scripting using DataFed.
You may use the interactive DataFed CLI or the Python package at this point.

Advanced Configuration
~~~~~~~~~~~~~~~~~~~~~~

Users would typically not need to configure the DataFed client from within a facility-supported
environments; however, when installing the client on personal workstations or laptops, the client requires a
few key settings to be configured prior to use. Configuration settings may be specified using
environment variables, configuration files, or command-line options (or any combination thereof) and
are described in detail in following sections of this document.

Most of the available client configuration settings relate to how the client communicates with the DataFed
server. DataFed uses encrypted client-server communication based on a message-passing protocol over
TCP/IP. In order for the client to be able to connect with the DataFed server, the hostname (or IP address)
and port number of the server must be configured along with the DataFed server's public encryption key.
If the client is being configured behind a firewall, it may be necessary to open the DataFed server port
if out-going TCP traffic is restricted.

When the DataFed client is installed, default server settings are automatically configured, and the
server public key is automatically downloaded from the DataFed server. However, for non-standard
environments, it may be necessary to configure these settings manually. The current default server
hostname, port, and public key download link are shown in the table below:

=================  ===================================================
Server Hostname    datafed.ornl.gov
Server Port        7512
Server Public Key  `<https://datafed.ornl.gov/datafed-core-key.pub>`_ 
=================  ===================================================

Please refer to the `Configuration Settings`_ section for details on how to configure these settings.


Configuration Files
-------------------
    
Both a server and a client configuration file may be used to specify settings. Typically, a server
configuration file would be maintained by a system administrator and contain server-only settings. Per-user
client configuration files allow individuals to tailor their settings by specifying additional options,
or by overriding configured server settings (the client file takes priority over the server file). 
    
Both server and client configuration files are standard ".ini" files and follow the same format, and the
reference table in `Settings Quick Reference`_ section indicate the .ini section and setting name for all
available options. An example configuration file is shown below::

    [server]
    host = datafed.ornl.gov
    port = 7512
    config_dir = /usr/share/datafed

    [client]
    config_dir = ~/.datafed

    [general]
    default_endpoint = cades#CADES-OR

.. note::
    If a configuration file is not explicitly specified (i.e. via an environment variable
    or command-line option), the DataFed client will search for a client configuration file in the ".datafed"
    directory in the users home directory.

Configuration Priority
----------------------

Each mechanism for specifying settings (environment variables, files, options, etc.) has a given priority,
and individual settings from configuration sources with higher priorities override those with lower
priorities. The result is that various configuration settings may come from a variety of sources (defaults
or set by system administrators, for example), but these settings can always be overridden by the user by
using the appropriate mechanism. Configuration source priorities are shown int the table, below.

====================  ===========
Source                Priority
====================  ===========
Default Values        0 (lowest)
Environment Variable  1
Server Config File    2
Client Config File    3
Command-Line Option   4
Programmatic          5 (highest)
====================  ===========

Note that most settings do not have default values and must be specified using one of the supported mechanisms.
The server and client configuration files and directories are exceptions in that the DataFec client will search for a
".datafed" folder in the user home directory if these settings are not specified.

Configuring Automatic Authentication
------------------------------------

Once the DataFed client is installed and configured, automatic authentication can be enabled for the DataFed
client by installing local client credentials (encryption key files). Automatic authentication can be considered
a convenience feature, but it is essential for non-interactive use of the Python API (i.e. for scripting). It is
enabled by simply running the following DataFed CLI command from the environment to be configured for
automatic authentication::

    datafed setup

When run the first time, the user must manually authenticate using their DataFed user ID and password.
(A user may set or change their DataFed password from DataFed Web Portal in the application settings dialog.)
The CLI will then install local user encryption keys (public and private) in the configured client
configuration directory. Subsequent use of the DateFed CLI or Python API within the same environment will
authenticate using the local client keys. These client key files must be protected and kept private. In the event of a
security incident, automatic authentication can be disabled by deleting the local key files, or, alternatively,
all of a user's installed keys can be revoked from the DataFed Web Portal using the "Revoke Credentials"
button in the application settings dialog. (This does not delete local key files, but invalidates the keys
on the server side.)


Configuration Settings
~~~~~~~~~~~~~~~~~~~~~~

Settings Quick Reference
------------------------

The table below lists all of the DataFed client settings and how they can be set using either a configuration
file (.ini), an environment variable, or a command-line option.

=========================  =======  ================  ============================  ======================
                           Config File
                           -------------------------
Setting                    Section  Setting           Environment Variable          CLI Option(s)
=========================  =======  ================  ============================  ======================
Server config file         N/A      N/A               DATAFED_SERVER_CFG_FILE       --server-cfg-file
Server config directory    server   config_dir        DATAFED_SERVER_CFG_DIR        --server-cfg-dir
Server public key file     server   public_key_file   DATAFED_SERVER_PUB_KEY_FILE   --server-pub-key-file
Sever hostname / IP        server   host              DATAFED_SERVER_HOST           --server-host
Sever port number          server   port              DATAFED_SERVER_PORT           --server-port
Client config file         client   config_file       DATAFED_CLIENT_CFG_FILE       --client-cfg-file
Client config directory    client   config_dir        DATAFED_CLIENT_CFG_DIR        --client-cfg-dir
Client public key file     client   public_key_file   DATAFED_CLIENT_PUB_KEY_FILE   --client-pub-key-file
Client private key file    client   private_key_file  DATAFED_CLIENT_PRIV_KEY_FILE  --client-priv-key-file
Client private key file    client   private_key_file  DATAFED_CLIENT_PRIV_KEY_FILE  --client-priv-key-file
Default Globus endpoint    general  default_endpoint  DATAFED_DEFAULT_ENDPOINT      --default-ep, -e
=========================  =======  ================  ============================  ======================

Server Configuration File
-------------------------

=======================  =======================
Configuration File:      N/A
Environment Variable:    DATAFED_SERVER_CFG_FILE
Command-line Option(s):  --server-cfg-file
=======================  =======================

The server configuration file setting specifies a full path to a server ".ini" file. This file may
contain additional settings as specified in `Configuration Settings`_ table, above.

Server Configuration Directory
------------------------------

=======================  ============================
Configuration File:      [server] config_dir
Environment Variable:    DATAFED_SERVER_CFG_DIR
Command-line Option(s):  --server-cfg-dir
=======================  ============================

The server configuration directory setting specifies a path to a directory that will be searched for
a default server config file, "server.ini", and the default server public key, "datafed-core-key.pub".
If this setting is not provided, "~/.default" will be searched if it exists.

Server Public Key File
----------------------

=======================  ============================
Configuration File:      [server] public_key_file
Environment Variable:    DATAFED_SERVER_PUB_KEY_FILE
Command-line Option(s):  --server-pub-key-file
=======================  ============================

The server public key file setting specifies a full path to a locally accessible file containing the
latest DataFed server public key. If this setting is not provided, the DataFed client will look for a
default key file, "datafed-core-key.pub", in the server config directory (or "~/.datafed" if no directory is
specified). The latest DataFed server public key file must is available for download from 
`here <https://datafed.ornl.gov/datafed-core-key.pub>`_.

.. note::

    Note that if the server public key setting is invalid or the key is out of date, the DataFed client will
    timeout after being run.

Server Host
-----------

=======================  ============================
Configuration File:      [server] host
Environment Variable:    DATAFED_SERVER_HOST
Command-line Option(s):  --server-host, -H
=======================  ============================

The server host setting is the DataFed server name or IP address with no protocol prefix or port number
- for example: "datafed.ornl.gov". Note that if the server host setting is incorrect, the client will timeout
after being run.

Server Port
-----------

=======================  ============================
Configuration File:      [server] port
Environment Variable:    DATAFED_SERVER_PORT
Command-line Option(s):  --server-port, -P
=======================  ============================

The server port setting is the TCP port number used by the DataFed server for secure client connections.
Note that if the server port number is incorrect, the client will timeout after being run.

Client Configuration File
-------------------------

=======================  ============================
Configuration File:      [client] config_file
Environment Variable:    DATAFED_CLIENT_CFG_FILE
Command-line Option(s):  --client-cfg-file
=======================  ============================

The client configuration file setting specifies a full path to a client ".ini" file. This file may contain
additional settings as listed in the `Settings Quick Reference`_ section. Note that settings in the client
configuration file will override the same settings in the server configuration file, if present.

Client Config Directory
-----------------------

=======================  ============================
Configuration File:      [client] config_dir
Environment Variable:    DATAFED_CLIENT_CFG_DIR
Command-line Option(s):  --client-cfg-dir
=======================  ============================

The client configuration directory setting specifies a path to a directory that will be searched for
a default client config file, "client.ini", and the default client public and private keys,
"datafed-user-key.pub" and "datafed-user-key.priv". If this setting is not provided, "~/.default" will be
searched if it exists.

Client Public Key File
----------------------

=======================  ============================
Configuration File:      [client] public_key_file
Environment Variable:    DATAFED_CLIENT_PUB_KEY_FILE
Command-line Option(s):  --client-pub-key-file
=======================  ============================

The client public key file setting specifies a full path to a locally accessible file containing the DataFed
client public key. If this setting is not provided, the DataFed client will look for a default key file,
"datafed-user-key.pub", in the client config directory (or "~/.datafed" if no directory is specified). Client
key files are automatically created in the specified location by the CLI. (See `Configuring Automatic Authentication`_).

Client Private Key File
-----------------------

=======================  ============================
Configuration File:      [client] private_key_file
Environment Variable:    DATAFED_CLIENT_PRIV_KEY_FILE
Command-line Option(s):  --client-priv-key-file
=======================  ============================

The client private key file setting specifies a full path to a locally accessible file containing the DataFed
client private key. If this setting is not provided, the DataFed client will look for a default key file,
"datafed-user-key.priv", in the client config directory (or "~/.datafed" if no directory is specified). Client
key files are automatically created in the specified location by the CLI. (See `Configuring Automatic Authentication`_).

Default Endpoint
----------------

=======================  ============================
Configuration File:      [general] default_endpoint
Environment Variable:    DATAFED_DEFAULT_ENDPOINT
Command-line Option(s):  --default-ep, -e
=======================  ============================

The default endpoint setting determines which Globus endpoint will be used for data "get" and "put"
commands when a full GLobus path is not specified. The configured default end-point can be changed at
any time within the CLI using the "ep default set" command, or it can be temporarily changed (not
saved) using the "ep set" command.

