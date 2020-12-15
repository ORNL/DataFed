==============================
DataFed Command Line Interface
==============================

Introduction
============

The DataFed command-line-interface (CLI) provides access to basic DataFed capabilities for both
interactive use and non-interactive scripting from a command shell. The DataFed CLI is provided
via a Python 3 package called "datafed" available on the `PyPi <https://pypi.org>`_ site, and,
because the DataFed CLI is based on Python, it can be installed and used on any operating system
that supports Python 3. (See the installation section, below, for specifics.)

The DataFed CLI Python package also contains an accessible API that can be used to build custom
Python applications that directly interface with the DataFed service. For more information on the
DataFed API, please refer to REF_REF_REF.

Installation
============

The DataFed CLI requires Python 3 to be installed and properly configured. Within supported
facilities, both Python 3 and the DataFed CLI is may already be installed and ready to use;
however, if you need to use the DataFed CLI from a non-supported facility, or on an external
workstation or laptop, then you will need to ensure that Python 3 is available, then install and
configure the DataFed CLI manually. In some cases, `Globus Personal Connect
<https://www.globus.org/globus-connect-personal>`_ may also need to be installed if access to
locally stored files is desired.

Like many Python packages, the DataFed CLI is easy to install using Python's "pip" tool. For Linux
and Mac OS, the command is as follows::

    pip install --user datafed

And for Windows, the command is::

    pip install -U datafed

Pip will install the DataFed CLI package and all dependencies, and will also install an executable
"datafed" command script in the configured pip package binary, or "bin" directory. This bin directory
must be included in the executable search path for the DataFed CLI command to be accessible.

The DataFed CLI must be configured before it can be used, and this is discussed in the next section.

Configuration
=============

Users would typically not need to configure the DataFed CLI from within a facility-supported
environments; however, when installing the CLI on personal workstations or laptops, the CLI requires a
few key settings to be configured prior to use.

Configuration settings may be specified using environment variables, configuration files, or command-line
options (or any combination thereof). The following sections list and describe the DataFed CLI settings.

----------------------
Configuration Settings
----------------------

The table below lists all of the DataFed CLI settings and how they can be set using either a configuration
file (.ini), an environment variable, or a command-line option. Many of the listed settings relate to
the communication channel between the CLI and the DataFed server. Because all communications across the
channel are encrypted, the locations of public and private DataFed encryption key files must be specified.
These keys are similar to SSH keys, but they are unique to DataFed; however, like SSH keys, access to
private DataFed key files must be restricted to prevent unauthorized access to user accounts. Configuring
DataFed key files, as well as other settings, are discussed in following sections.


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

=====================  =======================
Config File:           N/A
Environment Variable:  DATAFED_SERVER_CFG_FILE
Command Line Option:   --server-cfg-file
=====================  =======================

The server configuration file setting specifies a full path to a server ".ini" file. This file may
contain additional settings as specified in Configuration Settings table, above.

Server Configuration Directory

<tr><td>Cfg. File</td><td>[server] config_dir</td></tr>
<tr><td>Env. Var.</td><td>DATAFED_SERVER_CFG_DIR</td></tr>
<tr><td>Option</td><td>--server-cfg-dir</td></tr>


The server configuration directory setting specifies a path to a directory that will be searched for
a default server config file, "server.ini", and the default server public key, "datafed-core-key.pub".
If this setting is not provided, "~/.default" will be searched if it exists.


Server Public Key File
----------------------

<tr><td>Cfg. File</td><td>[server] public_key_file</td></tr>
<tr><td>Env. Var.</td><td>DATAFED_SERVER_PUB_KEY_FILE</td></tr>
<tr><td>Option</td><td>--server-pub-key-file</td></tr>


The server public key file setting specifies a full path to a locally accessible file containing the
latest DataFed server public key. If this setting is not provided, the CLI will look for a default key
file, "datafed-core-key.pub", in the server config directory (or "~/.datafed" if no directory is
specified). The latest DataFed server public key file must is available for download from 
`here <https://datafed.ornl.gov/datafed-core-key.pub>`_.

Note that if the server public key setting is invalid or the key is out of date, the CLI will timeout
after being run.

Server Host
-----------

<tr><td>Cfg. File</td><td>[server] host</td></tr>
<tr><td>Env. Var.</td><td>DATAFED_SERVER_HOST</td></tr>
<tr><td>Option</td><td>--server-host, -H</td></tr>

The server host setting is the DataFed server name or IP address with no protocol prefix or port number
- for example: "datafed.ornl.gov". Note that if the server host setting is incorrect, the CLI will timeout
after being run.

Server Port
-----------

<tr><td>Cfg. File</td><td>[server] port</td></tr>
<tr><td>Env. Var.</td><td>DATAFED_SERVER_PORT</td></tr>
<tr><td>Option</td><td>--server-port, -P</td></tr>

The server port setting is the TCP port number used by the DataFed server for secure client connections.
Note that if the server port number is incorrect, the CLI will timeout after being run.

Client Configuration File
-------------------------

<tr><td>Cfg. File</td><td>[client] config_file</td></tr>
<tr><td>Env. Var.</td><td>DATAFED_CLIENT_CFG_FILE</td></tr>
<tr><td>Option</td><td>--client-cfg-file</td></tr>

The client configuration file setting specifies a full path to a client ".ini" file. This file may contain
additional settings as specified in Table REF_REF_REF. Note that settings in the client configuration file
will override the same settings in the server configuration file, if present.

Client Config Directory
-----------------------

<tr><td>Cfg. File</td><td>[client] config_dir</td></tr>
<tr><td>Env. Var.</td><td>DATAFED_CLIENT_CFG_DIR</td></tr>
<tr><td>Option</td><td>--client-cfg-dir</td></tr>

The client configuration directory setting specifies a path to a directory that will be searched for
a default client config file, "client.ini", and the default client public and private keys,
"datafed-user-key.pub" and "datafed-user-key.priv". If this setting is not provided, "~/.default" will be
searched if it exists.

Client Public Key File
----------------------

<tr><td>Cfg. File</td><td>[client] public_key_file</td></tr>
<tr><td>Env. Var.</td><td>DATAFED_CLIENT_PUB_KEY_FILE</td></tr>
<tr><td>Option</td><td>--client-pub-key-file</td></tr>

The client public key file setting specifies a full path to a locally accessible file containing the DataFed
client public key. If this setting is not provided, the CLI will look for a default key file,
"datafed-user-key.pub", in the client config directory (or "~/.datafed" if no directory is specified). Client
key files are automatically created in the specified location by the CLI. (See Configuring Automatic Authentication, below).

Client Private Key File
-----------------------

<tr><td>Cfg. File</td><td>[client] private_key_file</td></tr>
<tr><td>Env. Var.</td><td>DATAFED_CLIENT_PRIV_KEY_FILE</td></tr>
<tr><td>Option</td><td>--client-priv-key-file</td></tr>

The client private key file setting specifies a full path to a locally accessible file containing the DataFed
client private key. If this setting is not provided, the CLI will look for a default key file,
"datafed-user-key.priv", in the client config directory (or "~/.datafed" if no directory is specified). Client
key files are automatically created in the specified location by the CLI. (See Configuring Automatic Authentication, below).

Default Endpoint
----------------

<tr><td>Cfg. File</td><td>[general] default_endpoint</td></tr>
<tr><td>Env. Var.</td><td>DATAFED_DEFAULT_ENDPOINT</td></tr>
<tr><td>Option</td><td>--default-ep, -e</td></tr>

The default endpoint setting determines which Globus endpoint will be used for data "get" and "put"
commands when a full GLobus path is not specified. The configured default end-point can be changed at
any time within the CLI using the "ep default set" command, or it can be temporarily changed (not
saved) using the "ep set" command.

-------------------
Configuration Files
-------------------
    
Both a server and a client configuration file may be used to specify CLI settings. Typically, a server
configuration file would be maintained by a system administrator and contain server-only settings. Per-user
client configuration files allow individuals to tailor their CLI settings by specifying additional options,
or by overriding configured server settings (the client file takes priority over the server file). 
    
Both server and client configuration files are standard ".ini" files and follow the same format, and Table
REF_REF_REF (above) shows the section and setting name for all available options. Below is in example
configuration file::

    [server]
    host = datafed.ornl.gov
    port = 7512
    config_dir = /usr/share/datafed

    [client]
    config_dir = ~/.datafed

    [general]
    default_endpoint = cades#CADES-OR

----------------------
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
Default               0 (lowest)
Environment Variable  1
Server Config File    2
Client Config File    3
Command-Line Option   4
Programmatic          5 (highest)
====================  ===========

Note that most settings do not have default values and must be specified using one of the supported mechanisms.
The server and client configuration files and directories are exceptions in that the CLI will search for a
".datafed" folder in the user home directory if these settings are not specified.

------------------------------------
Configuring Automatic Authentication
------------------------------------

Once the DataFed CLI is installed and configured, automatic authentication can be enabled for the CLI
by installing local client credentials (encryption key files). Automatic authentication can be considered
a convenience feature, but it is essential for non-interactive use of the CLI (i.e. for scripting). It is
enabled by simply running the following CLI command from the environment to be configured for
automatic authentication::

    datafed setup

When run the first time, the user must manually authenticate using their DataFed user ID and password.
(A user may set or change their DataFed password from DataFed Web Portal in the application settings dialog.)
The CLI will then install local user encryption keys (public and private) in the configured client
configuration directory. Subsequent use of the DateFed CLI within the same environment will authenticate
using the local client keys. These client key files must be protected and kept private. In the event of a
security incident, automatic authentication can be disabled by deleting the local key files, or, alternatively,
all of a user's installed keys can be revoked from the DataFed Web Portal using the "Revoke Credentials"
button in the application settings dialog. (This does not delete local key files, but invalidates the keys
on the server side.)

Command Line Interface Usage
============================

REF_REF_REF


Scripting with the CLI
======================

The DataFed CLI can be used for scripting by using the "--script" option to produce output in JSON format;
however, Python API modules are also available for more complex scripting and/or custom application development.
There are two library modules, "CommandLib" and "MessageLib", that provide high- and-low-level application
programming interfaces (APIs), respectively, that can be used for Python scripting or custom application development.
The high-level API is almost identical to the the DataFed command-line interface, in that it accepts textual CLI
commands, but returns Python objects instead of text or JSON output. The low-level API, as the module name implies,
exposes the binary message-passing interface used by DataFed and is intended for more complex applications.

