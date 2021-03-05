----------------
Datafed Commands
----------------

'datafed' is the command-line interface (CLI) for the DataFed federated data management
service and may be used to access many of the features available via the DataFed web
portal. This CLI may be used interactively (human-friendly output) or for scripting (JSON
output) by specifying the -s option.

When the datafed CLI is run without any command arguments, a interactive shell session is
started. While in the shell, commands should be entered without specifying the 'datafed'
prefix.

Usage::

    datafed [OPTIONS] COMMAND [ARGS]...

Options:

-m, --manual-auth  Force manual authentication
-s, --script  Start in non-interactive scripting mode. Output is in JSON, all intermediate I/O is disabled, and certain client-side commands are unavailable.
--version  Print version number and exit.
-v, --verbosity INTEGER  Verbosity level (0=quiet,1=normal,2=verbose) for text-format output only.
--server-cfg-file TEXT  Server configuration file
-P, --server-port INTEGER  Server port number
--server-cfg-dir TEXT  Server configuration directory
--client-pub-key-file TEXT  Client public key file
--client-cfg-dir TEXT  Client configuration directory
-e, --default-ep TEXT  Default Globus endpoint
-H, --server-host TEXT  Sever host name or IP address
--client-priv-key-file TEXT  Client private key file
--client-cfg-file TEXT  Client configuration file
--server-pub-key-file TEXT  Server public key file
-h, --help  Show this message and exit.

Sub-Commands:

===============  ============================================================
coll             Collection commands.
data             Data commands.
ep               Endpoint commands.
exit             Exit an interactive session.
help             Show DataFed CLI help.
ls               List contents of a collection, or shared items.
project          Project commands.
query            Data query commands.
setup            Setup local credentials.
shares           List users and/or projects sharing data with current user.
task             Task management commands.
user             User commands.
verbosity        Set/display verbosity level.
wc               Set/print current working collection or path.
wp               Get current working path.
===============  ============================================================

-------------
Coll Commands
-------------

Collection commands.

Usage::

    datafed coll [OPTIONS] COMMAND [ARGS]...

Options:

-h, --help  Show this message and exit.

Sub-Commands:

===============  ============================================================
add              Add data records and/or collections to a collection.
create           Create a new collection.
delete           Delete one or more existing collections.
remove           Remove data records and/or collections from a collection.
update           Update an existing collection.
view             View collection information.
===============  ============================================================

Coll Add Command
----------------

Add data records and/or collections to a collection. COLL_ID is the
destination collection and ITEM_IDs specify one or more data records and/or
collections to add to the destination collection. COLL_ID and ITEM_IDs may
be IDs, aliases, or index values from a listing. COLL_ID may also be a
relative collection path ('.', '..', or '/').

Usage::

    datafed coll add [OPTIONS] COLL_ID ITEM_ID

Options:

-X, --context TEXT  User or project ID for command alias context. See 'alias' command help for more information.
-h, --help  Show this message and exit.


Coll Create Command
-------------------

Create a new collection. The collection 'title' is required, but all
other attributes are optional. On success, the ID of the created
collection is returned. Note that if a parent collection is specified, and
that collection belongs to a project or other collaborator, the creating
user must have permission to write to that collection.

Usage::

    datafed coll create [OPTIONS] TITLE

Options:

-a, --alias TEXT  Alias
-p, --parent TEXT  Parent collection ID/alias (default is current working collection)
-d, --description TEXT  Description text
-T, --tags TEXT  Tags (comma separated list).
--topic TEXT  Publish the collection to the provided topic.
-X, --context TEXT  User or project ID for command alias context. See 'alias' command help for more information.
-v, --verbosity [0|1|2]  Verbosity level of output
-h, --help  Show this message and exit.


Coll Delete Command
-------------------

Delete one or more existing collections. Multiple ID arguments can be
provided and may be collection IDs, aliases, or index values from a
listing. By default, a confirmation prompt is used, but this can be
bypassed with the '--force' option.

When a collection is deleted, all contained collections are also deleted;
however, contained data records are only deleted if they are not linked to
another collection not involved in the deletion.

Usage::

    datafed coll delete [OPTIONS] ID

Options:

-f, --force  Delete without confirmation.
-X, --context TEXT  User or project ID for command alias context. See 'alias' command help for more information.
-h, --help  Show this message and exit.


Coll Remove Command
-------------------

Remove data records and/or collections from a collection. COLL_ID is the
containing collection and ITEM_IDs specify one or more data records and/or
collections to remove from the containing collection. COLL_ID and ITEM_IDs
may be IDs, aliases, or index values from a listing. COLL_ID may also be a
relative collection path ('.', '..', or '/').

Usage::

    datafed coll remove [OPTIONS] COLL_ID ITEM_ID

Options:

-X, --context TEXT  User or project ID for command alias context. See 'alias' command help for more information.
-h, --help  Show this message and exit.


Coll Update Command
-------------------

Update an existing collection. The collection ID is required and can be
an ID, alias, or listing index; all other collection attributes are
optional.

Usage::

    datafed coll update [OPTIONS] ID

Options:

-t, --title TEXT  Title
-a, --alias TEXT  Alias
-d, --description TEXT  Description text
-T, --tags TEXT  Tags (comma separated list).
--topic TEXT  Publish the collection under the provided topic.
-X, --context TEXT  User or project ID for command alias context. See 'alias' command help for more information.
-v, --verbosity [0|1|2]  Verbosity level of output
-h, --help  Show this message and exit.


Coll View Command
-----------------

View collection information. Displays collection title, description, and
other administrative fields. ID may be a collection identifier, alias, or
index value from a listing. Use 'coll list' command to see items contained
in a collection.

Usage::

    datafed coll view [OPTIONS] ID

Options:

-X, --context TEXT  User or project ID for command alias context. See 'alias' command help for more information.
-v, --verbosity [0|1|2]  Verbosity level of output
-h, --help  Show this message and exit.


-------------
Data Commands
-------------

Data commands.

Usage::

    datafed data [OPTIONS] COMMAND [ARGS]...

Options:

-h, --help  Show this message and exit.

Sub-Commands:

===============  ============================================================
batch            Data batch commands.
create           Create a new data record.
delete           Delete one or more existing data records.
get              Get (download) raw data of data records and/or collections.
put              Put (upload) raw data located at PATH to DataFed record ID.
update           Update an existing data record.
view             View data record information.
===============  ============================================================

Data Batch Commands
-------------------

Data batch commands.

Usage::

    datafed data batch [OPTIONS] COMMAND [ARGS]...

Options:

-h, --help  Show this message and exit.

Sub-Commands:

===============  ============================================================
create           Batch create data records from JSON file(s).
update           Batch update data records from JSON file(s).
===============  ============================================================

Data Batch Create Command
^^^^^^^^^^^^^^^^^^^^^^^^^

Batch create data records from JSON file(s). Multiple FILE arguments may be
specified and are absolute or relative paths to JSON inputs file on a local
filesystem. JSON input files may contain individual JSON objects, or arrays
of JSON objects. Each JSON object represents a new data record and the JSON
must comply with the DataFed record input schema (see online documentation).

Usage::

    datafed data batch create [OPTIONS] FILE

Options:

-c, --collection TEXT  Optional target collection (default is root).
-X, --context TEXT  User or project ID for command alias context. See 'alias' command help for more information.
-h, --help  Show this message and exit.


Data Batch Update Command
^^^^^^^^^^^^^^^^^^^^^^^^^

Batch update data records from JSON file(s). Multiple FILE arguments may be
specified and are absolute or relative paths to JSON inputs file on a local
filesystem. JSON input files may contain individual JSON objects, or arrays
of JSON objects. Each JSON object represents a new data record and the JSON
must comply with the DataFed record input schema (see online documentation).

Usage::

    datafed data batch update [OPTIONS] FILE...

Options:

-h, --help  Show this message and exit.


Data Create Command
-------------------

Create a new data record. The data record 'title' is required, but all
other attributes are optional. On success, the ID of the created data
record is returned. Note that if a parent collection is specified, and
that collection belongs to a project or other collaborator, the creating
user must have permission to write to that collection. The raw-data-file
option is only supported in interactive mode and is provided as a
convenience to avoid a separate dataPut() call.

Usage::

    datafed data create [OPTIONS] TITLE

Options:

-a, --alias TEXT  Record alias.
-d, --description TEXT  Description text.
-T, --tags TEXT  Tags (comma separated list).
-r, --raw-data-file TEXT  Globus path to raw data file (local or remote) to upload to new record. Default endpoint is used if none provided.
-x, --extension TEXT  Override raw data file extension if provided (default is auto detect).
-m, --metadata TEXT  Inline metadata in JSON format. JSON must define an object type. Cannot be specified with --metadata-file option.
-f, --metadata-file TEXT  Path to local metadata file containing JSON. JSON must define an object type. Cannot be specified with --metadata option.
-p, --parent TEXT  Parent collection ID, alias, or listing index. Default is the current working collection.
-R, --repository TEXT  Repository ID. Uses default allocation if not specified.
-D, --deps <CHOICE TEXT>...  Dependencies (provenance). Use one '--deps' option per dependency and specify with a string consisting of the type of relationship ('der', 'comp', 'ver') follwed by ID/alias of the referenced record. Relationship types are: 'der' for 'derived from', 'comp' for 'a component of', and 'ver' for 'a new version of'.
-X, --context TEXT  User or project ID for command alias context. See 'alias' command help for more information.
-v, --verbosity [0|1|2]  Verbosity level of output
-h, --help  Show this message and exit.


Data Delete Command
-------------------

Delete one or more existing data records. Multiple ID arguments can be
provided and may data record IDs, aliases, or index values from a listing.
By default, a confirmation prompt is used, but this can be bypassed with
the '--force' option.

Usage::

    datafed data delete [OPTIONS] ID

Options:

-f, --force  Delete record(s) without confirmation.
-X, --context TEXT  User or project ID for command alias context. See 'alias' command help for more information.
-h, --help  Show this message and exit.


Data Get Command
----------------

Get (download) raw data of data records and/or collections. Multiple ID
arguments can be specified and may be data record and/or collection IDs,
aliases, or index values from s listing. The PATH argument is the
destination for the download and can be either a full Globus path (with
endpoint), or a local file system path (absolute or relative).

Downloads will involve either Globus transfers or HTTP transfers depending
on the source data for the selected records, and the two source types may
not be mixed. For Globus transfers, if no endpoint is specified in the PATH
argument, the current endpoint will be used. For HTTP transfers, the PATH
argument may be an absolute or relative path within the local filesystem.
For both cases, if the destination PATH doesn't exist, it will be created
given sufficient filesystem permissions.

Because HTTP downloads are performed directly by the CLI, they are always
blocking calls; thus the 'wait' option only applies to Globus transfers.

Usage::

    datafed data get [OPTIONS] ID PATH

Options:

-w, --wait  Block until Globus transfer is complete.
-e, --encrypt [0|1|2]  Encryption mode: 0 = none, 1 = if available (default), 2 = force.
-o, --orig_fname  Download to original filename(s).
-X, --context TEXT  User or project ID for command alias context. See 'alias' command help for more information.
-h, --help  Show this message and exit.


Data Put Command
----------------

Put (upload) raw data located at PATH to DataFed record ID.  The ID
argument may be data record ID, alias, or index value from a listing.
The PATH argument specifies the source file for the upload and can be
either a full Globus path (with endpoint), or a local file system path
(absolute or relative). If no endpoint is specified in the PATH
argument, the current endpoint will be used.

Usage::

    datafed data put [OPTIONS] ID PATH

Options:

-w, --wait  Block reply or further commands until transfer is complete
-x, --extension TEXT  Override extension for raw data file (default = auto detect).
-e, --encrypt [0|1|2]  Encryption mode: 0 = none, 1 = if available (default), 2 = force.
-X, --context TEXT  User or project ID for command alias context. See 'alias' command help for more information.
-h, --help  Show this message and exit.


Data Update Command
-------------------

Update an existing data record. The data record ID is required and can be
an ID, alias, or listing index; all other record attributes are optional.
The raw-data-file option is only supported in interactive mode and is
provided as a convenience to avoid a separate dataPut() call.

Usage::

    datafed data update [OPTIONS] ID

Options:

-t, --title TEXT  Title
-a, --alias TEXT  Alias
-d, --description TEXT  Description text
-T, --tags TEXT  Tags (comma separated list)
-r, --raw-data-file TEXT  Globus path to raw data file (local or remote) to upload with record. Default endpoint used if none provided.
-x, --extension TEXT  Override extension for raw data file (default = auto detect).
-m, --metadata TEXT  Inline metadata in JSON format.
-f, --metadata-file TEXT  Path to local metadata file containing JSON.
-S, --metadata-set  Set (replace) existing metadata with provided instead of merging.
-A, --deps-add <CHOICE TEXT>...  Specify dependencies to add by listing first the type of relationship ('der', 'comp', or 'ver') follwed by ID/alias of the target record. Can be specified multiple times.
-R, --deps-rem <CHOICE TEXT>...  Specify dependencies to remove by listing first the type of relationship ('der', 'comp', or 'ver') followed by ID/alias of the target record. Can be specified multiple times.
-X, --context TEXT  User or project ID for command alias context. See 'alias' command help for more information.
-v, --verbosity [0|1|2]  Verbosity level of output
-h, --help  Show this message and exit.


Data View Command
-----------------

View data record information. Displays record title, description, tags,
and other informational and administrative fields. ID may be a data record
identifier, alias, or index value from a listing. By default, description
text is truncated and metadata is not shown unless the verbosity is as
level 2.

Usage::

    datafed data view [OPTIONS] ID

Options:

-X, --context TEXT  User or project ID for command alias context. See 'alias' command help for more information.
-v, --verbosity [0|1|2]  Verbosity level of output
-h, --help  Show this message and exit.


-----------
Ep Commands
-----------

Endpoint commands.

Usage::

    datafed ep [OPTIONS] COMMAND [ARGS]...

Options:

-h, --help  Show this message and exit.

Sub-Commands:

===============  ============================================================
default          Default endpoint commands.
get              Get Globus endpoint for the current session.
list             List recently used endpoints.
set              Set endpoint for the current session.
===============  ============================================================

Ep Default Commands
-------------------

Default endpoint commands.

Usage::

    datafed ep default [OPTIONS] COMMAND [ARGS]...

Options:

-h, --help  Show this message and exit.

Sub-Commands:

===============  ============================================================
get              Show the default Globus endpoint.
set              Set the default Globus endpoint.
===============  ============================================================

Ep Default Get Command
^^^^^^^^^^^^^^^^^^^^^^

Show the default Globus endpoint.

Usage::

    datafed ep default get [OPTIONS]

Options:

-h, --help  Show this message and exit.


Ep Default Set Command
^^^^^^^^^^^^^^^^^^^^^^

Set the default Globus endpoint. The default endpoint will be set from the
'endpoint' argument, or if the '--current' options is specified, from the
currently active endpoint.

Usage::

    datafed ep default set [OPTIONS] [ENDPOINT]

Options:

-c, --current  Set default endpoint to current endpoint.
-h, --help  Show this message and exit.


Ep Get Command
--------------

Get Globus endpoint for the current session. At the start of a session, the
current endpoint will be set to the default endpoint, if configured.

Usage::

    datafed ep get [OPTIONS]

Options:

-h, --help  Show this message and exit.


Ep List Command
---------------

List recently used endpoints.

Usage::

    datafed ep list [OPTIONS]

Options:

-h, --help  Show this message and exit.


Ep Set Command
--------------

Set endpoint for the current session. If no endpoint is given, the
default endpoint will be set as the current endpoint, if configured.

Usage::

    datafed ep set [OPTIONS] [ENDPOINT]

Options:

-h, --help  Show this message and exit.


------------
Exit Command
------------

Exit an interactive session. Ctrl-C may also be used to exit the shell.

Usage::

    datafed exit [OPTIONS]

Options:

-h, --help  Show this message and exit.


------------
Help Command
------------

Show DataFed CLI help. Include a command name as the argument to see
command-specific help.

Usage::

    datafed help [OPTIONS] [COMMAND]...

Options:

-h, --help  Show this message and exit.


----------
Ls Command
----------

List contents of a collection, or shared items. ID may be a collection ID
or alias, a relative path, a user or project ID, an index value from a
listing, or omitted for the current working collection. If the ID is a
user or project, the ls command will list shared items associated with the
given user or project.

Usage::

    datafed ls [OPTIONS] ID

Options:

-O, --offset INTEGER  Start list at offset
-C, --count INTEGER  Limit list to count results
-X, --context TEXT  User or project ID for command alias context. See 'alias' command help for more information.
-h, --help  Show this message and exit.


----------------
Project Commands
----------------

Project commands.

Usage::

    datafed project [OPTIONS] COMMAND [ARGS]...

Options:

-h, --help  Show this message and exit.

Sub-Commands:

===============  ============================================================
list             List projects associated with current user.
view             View project information.
===============  ============================================================

Project List Command
--------------------

List projects associated with current user. List projects that are owned or managed by the
current user, as well as projects were the current user is a member.

Usage::

    datafed project list [OPTIONS]

Options:

-o, --owned  Include owned projects
-a, --admin  Include administered projects
-m, --member  Include membership projects
-O, --offset INTEGER  Start list at offset
-C, --count INTEGER  Limit list to count results
-h, --help  Show this message and exit.


Project View Command
--------------------

View project information. Current user must have a role (owner, manager, or
member) within the project specified by the ID argument.

Usage::

    datafed project view [OPTIONS] ID

Options:

-v, --verbosity [0|1|2]  Verbosity level of output
-h, --help  Show this message and exit.


--------------
Query Commands
--------------

Data query commands.

Usage::

    datafed query [OPTIONS] COMMAND [ARGS]...

Options:

-h, --help  Show this message and exit.

Sub-Commands:

===============  ============================================================
create           Create a saved query.
delete           Delete a saved query by ID.
exec             Execute a saved query by ID.
list             List saved queries.
run              Run a directly entered query.
update           Update a saved query.
view             View a saved query by ID.
===============  ============================================================

Query Create Command
--------------------

Create a saved query.

Usage::

    datafed query create [OPTIONS] TITLE

Options:

-i, --id TEXT  ID/alias expression
-t, --text TEXT  Text expression
-m, --meta TEXT  Metadata expression
-n, --no-default  Exclude personal data and projects
-c, --coll TEXT  Collection(s) to search
-p, --proj TEXT  Project(s) to search
-h, --help  Show this message and exit.


Query Delete Command
--------------------

Delete a saved query by ID.

Usage::

    datafed query delete [OPTIONS] ID

Options:

-h, --help  Show this message and exit.


Query Exec Command
------------------

Execute a saved query by ID.

Usage::

    datafed query exec [OPTIONS] ID

Options:

-O, --offset INTEGER  Start results list at offset
-C, --count INTEGER  Limit to count results
-h, --help  Show this message and exit.


Query List Command
------------------

List saved queries.

Usage::

    datafed query list [OPTIONS]

Options:

-O, --offset INTEGER  Start list at offset
-C, --count INTEGER  Limit list to count results
-h, --help  Show this message and exit.


Query Run Command
-----------------

Run a directly entered query. Unless the 'no-default' option is included,
the search scope includes all data owned by the authenticated user (in
their root collection and projects that are owned or managed, or where the
user is a member of the project. Projects and collections that are not part
of the default scope may be added using the --proj and --coll options
respectively.

Usage::

    datafed query run [OPTIONS]

Options:

-i, --id TEXT  ID/alias expression
-t, --text TEXT  Text expression
-m, --meta TEXT  Metadata expression
-n, --no-default  Exclude personal data and projects
-c, --coll TEXT  Collection(s) to search
-p, --proj TEXT  Project(s) to search
-O, --offset INTEGER  Start result list at offset
-C, --count INTEGER  Limit to count results (default = 20)
-h, --help  Show this message and exit.


Query Update Command
--------------------

Update a saved query. The title and search terms of a query may be updated;
however, search scope cannot currently be changed. To remove a term,
specify an empty string ("") for the associated option.

Usage::

    datafed query update [OPTIONS] ID

Options:

--title TEXT  New query title
-i, --id TEXT  ID/alias expression
-t, --text TEXT  Text expression
-m, --meta TEXT  Metadata expression
-h, --help  Show this message and exit.


Query View Command
------------------

View a saved query by ID.

Usage::

    datafed query view [OPTIONS] ID

Options:

-h, --help  Show this message and exit.


-------------
Setup Command
-------------

Setup local credentials. This command installs DataFed credentials for the
current user in the configured client configuration directory. Subsequent
use of the DataFed CLI will read these credentials instead of requiring
manual authentication.

Usage::

    datafed setup [OPTIONS]

Options:

-h, --help  Show this message and exit.


--------------
Shares Command
--------------

List users and/or projects sharing data with current user.

Usage::

    datafed shares [OPTIONS]

Options:

-u, --users  Show users only
-p, --projects  Show projects only
-h, --help  Show this message and exit.


-------------
Task Commands
-------------

Task management commands.

Usage::

    datafed task [OPTIONS] COMMAND [ARGS]...

Options:

-h, --help  Show this message and exit.

Sub-Commands:

===============  ============================================================
list             List recent tasks.
view             Show task information.
===============  ============================================================

Task List Command
-----------------

List recent tasks. If no time or status filter options are
provided, all tasks initiated by the current user are listed,
most recent first. Note that the DataFed server periodically purges
tasks history such that only up to 30 days of history are retained.

Usage::

    datafed task list [OPTIONS]

Options:

-s, --since TEXT  List from specified time (seconds default, suffix h = hours, d = days, w = weeks)
-f, --from TEXT  List from specified date/time (M/D/YYYY[,HH:MM])
-t, --to TEXT  List up to specified date/time (M/D/YYYY[,HH:MM])
-S, --status [0|1|2|3|4|queued|ready|running|succeeded|failed]  List tasks matching specified status
-O, --offset INTEGER  Start list at offset
-C, --count INTEGER  Limit list to count results
-h, --help  Show this message and exit.


Task View Command
-----------------

Show task information. Use the ID argument to view a specific task
record, or omit to view the latest task initiated by the current user.

Usage::

    datafed task view [OPTIONS] ID

Options:

-h, --help  Show this message and exit.


-------------
User Commands
-------------

User commands.

Usage::

    datafed user [OPTIONS] COMMAND [ARGS]...

Options:

-h, --help  Show this message and exit.

Sub-Commands:

===============  ============================================================
all              List all users.
collab           List all users that are collaborators.
view             View user information.
who              Show current authenticated user ID.
===============  ============================================================

User All Command
----------------

List all users.

Usage::

    datafed user all [OPTIONS]

Options:

-O, --offset INTEGER  Start list at offset
-C, --count INTEGER  Limit list to count results
-h, --help  Show this message and exit.


User Collab Command
-------------------

List all users that are collaborators. Collaborators are defined as users
that have projects in common with the current user, or that have data-
sharing relationships with the current user.

Usage::

    datafed user collab [OPTIONS]

Options:

-O, --offset INTEGER  Start list at offset
-C, --count INTEGER  Limit list to count results
-h, --help  Show this message and exit.


User View Command
-----------------

View user information.

Usage::

    datafed user view [OPTIONS] UID

Options:

-h, --help  Show this message and exit.


User Who Command
----------------

Show current authenticated user ID.

Usage::

    datafed user who [OPTIONS]

Options:

-h, --help  Show this message and exit.


-----------------
Verbosity Command
-----------------

Set/display verbosity level. The verbosity level argument can be 0
(lowest), 1 (normal), or 2 (highest). If the the level is omitted, the
current verbosity level is returned.

Usage::

    datafed verbosity [OPTIONS] [LEVEL]

Options:

-h, --help  Show this message and exit.


----------
Wc Command
----------

Set/print current working collection or path. 'ID' can be a collection ID, alias,
list index number, '-' (previous collection), or path. Only '..' and '/' are
supported for paths. 'cd' is an alias for this command.

Usage::

    datafed wc [OPTIONS] ID

Options:

-h, --help  Show this message and exit.


----------
Wp Command
----------

Get current working path. Displays the full path of the current working
collection starting from the root collection of the associated user or
project.

Usage::

    datafed wp [OPTIONS]

Options:

-h, --help  Show this message and exit.



