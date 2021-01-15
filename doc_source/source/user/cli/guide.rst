==========
User Guide
==========

.. include:: header.rst

This document covers basic and advanced usage of the DataFed CLI, with examples. Before the DataFed CLI
can be used the DataFed Python client package must be locally installed and configured - refer to the
CLI :doc:`/user/cli/install` page for details. Reading both the DataFed `getting-started guide </system/getting_started>`_ 
and the `overview </system/overview>`_ are recommended to understand DataFed prerequisites and basic concepts,
respectively.

.. attention::

    This section is not complete. Additional Topics to be covered include:
    - Navigating collections
    - Accessing project and shared data and collections
    - Data transfers (asynch, monitoring)


Introduction
============

The DataFed CLI is a text-based utility primarily intended for interactive use and for simple
non-interactive scripting. For more involved scripting, the DataFed Python API is strongly
recommended. The DataFed CLI and the DataFed Python API are both provided in the same DataFed Python
client package, and this package only needs to be installed and configured once per host system
to access either the CLI or the API.

The DataFed CLI is run from an operating system shell using the 'datafed' script which is installed 
by the DataFed Python client package. 

.. note::

    If the "datafed" command is not found after installing the DataFed Python client package, please
    verify that the appropriate Python binary directory is included in the executable search path of
    the host operating system.

The DataFed CLI supports three distinct modes of use: single command, interactive, and shell
scripting. If the CLI is run without any command arguments, an interactive sub-shell is started; otherwise,
the specified command is run either normally (human-friendly output) or in shell scripting mode when the
'--script' option is specified. Regardless of which mode is used, most DataFed commands look and behave
the same with the only exception being the output format.

**Single Command Mode**

This mode is used to run a single DafaFed command from an operating system command prompt with the command
given as an argument to the datafed script. The output is in human-friendly format and the datafed script
exits immediately after producing output. For example, the 'user who' command prints the ID of the currently
authenticated user, as follows:

.. code:: bash

    $ datafed user who
    User ID: u/user123

**Interactive Mode**

This mode provides a DataFed CLI sub-shell and is started by running the datafed script without any
command arguments. Commands are entered at a DataFed command prompt and the shell will run until stopped
with the 'exit' command, or by typing 'Ctrl-C'. Interactive mode is stateful and convenient when needing
to run multiple DataFed commands and for browsing DataFed collection hierarchies.

When using interactive mode, commands are entered at the DataFed command prompt without the preceding
"datafed" script name. For example, use 'user who' instead of 'datafed user who', as in:

.. code:: bash

    $ datafed
    Welcome to DataFed CLI, version 1.1.0:0
    Authenticated as u/user123
    Use 'exit' command or Ctrl-C to exit shell.

    root>user who
    User ID: u/user123
    root>

The ``root`` prompt in the example output above indicates the current collection (logical folder) within
the user's personal data space inside DataFed. Collections will be discussed in detail in the `Organizing Data`
section later in this guide.


.. note::

   Operating system commands cannot be called from within the interactive mode of DataFed. If needed, users
   are encouraged to utilize two concurrent terminal sessions to interleave operating system and DataFed-specific
   commands. It is possible to interleave operating system and DataFed commands in the other modes.


**Shell Scripting Mode**

This mode is similar to the single command mode with the exception that non-essential output is
suppressed and command responses are returned in a strict JSON format. This mode is useful for
integrating the CLI into non-Python scripts, and is activated by specifying the "--script"
(or "-s") command line option when the CLI is run. As in the previous examples, the "user who"
command in script mode is run as follows:

.. code:: bash

    $ datafed -s user who
    {"uid":"u/user123"}

The JSON document output from script mode follows the same naming conventions and structure as used
by the DataFed Python API for reply objects returned from commands.

.. note::

   Users are highly encouraged to use the :doc:`python API  </user/python_scripting>` for non-trivial
   scripting needs since it is easier to use and returned information from DataFed commands are Python
   objects rather than JSON.

Command Syntax
==============

Commands, sub-commands, options, and arguments are specified as shown below when running the DataFed CLI
using the 'datafed' script:

.. code:: bash

    datafed [options] command [options] [arguments] [sub-command [options] [arguments] ...]

When entering a command from the DataFed interactive-mode command prompt, the format is the same, but
without the 'datafed' script name:

.. code:: bash

    command [options] [arguments] [sub-command [options] [arguments] ...]

DataFed commands and sub-commands are hierarchical and are organized into categories. Built-in help
can be accessed using a universal help option (--help or -h). For example, to view help information
for the 'datafed' script itself, use:

.. code:: bash

    datafed --help

Or to view help for a nested sub-command, such as "data create", use:

.. code:: bash

    datafed data create --help

In any case, the help output will describe the command, and list and describe all options, arguments,
and any additional sub-commands. Both options and arguments are position sensitive and must always be
specified following their associated command or sub-command.

Command Shortcuts
=================

For convenience, command names may be abbreviated to only the initial characters needed to avoid ambiguity
with any other commands. For example, the "data create" command can be entered as simply "d c". Some
commands also have built-in alternative names that may be more natural to certain users based on their
experience with certain operating system shells. Current command alternatives are:

- 'cd' (change directory) is equivalent to 'wc' (working collection)
- 'dir' (directory) is equivalent to 'ls' (list)

When using the DataFed CLI in interactive mode, an additional convenience feature is provided to make it
easier to interact with commands that list multiple items in their output. Each item listed will start with a
numeric index value, starting at 1. These index values can be used in place of identifiers and aliases for
subsequent commands.

For example, listing the contents of a collection using the 'ls' command will produce results in the following
format:

.. code::

    root>ls
    1. c/12351468                         A simple collection
    2. c/11801571   (demo)                A collection for demonstration data
    3. c/14022631   (test)                Collection of test data

After running the command above, shortcuts for the three listed collections are enabled (as 1, 2, and 3). These
shortcuts can then be used on a follow-up command, such as viewing the first collection from the previous example:

.. code::

    root>coll view 1
    ID:            c/12351468
    Alias:         (none)
    Title:         A simple collection
    Tags:          (none)
    Topic:         (not published)
    Owner:         user123
    Created:       09/25/2020,10:32
    Updated:       10/02/2020,13:07
    Description:   An example collection
    root>

Using listing index numbers is far quicker than typing in the ID or alias of a record or collection in a follow-up
command. These index numbers remain valid until they are replaced by a subsequent command that generates
listing output.

.. note::

    The interactive mode of the DataFed CLI features a powerful command prompt editor with command history and
    autocompletion features. Command history can be browsed using the up and down arrow keys, and autocompletion
    can be triggered with the right arrow key.

Help and Documentation
======================

Readers are encouraged to refer to the extensive :doc:`documentation of DataFed's CLI </user/cli/reference>` for complete
information on how to interact with DataFed using its CLI. Alternatively, this same documentation is also available via
the 'help' commands from within DataFed. For example, if we knew that we wanted to perform certain data related operations,
but did not know the specific commands or options available through the CLI, we would access the 'data' sub-command help
as follows:

.. code:: bash

    $ datafed
    Welcome to DataFed CLI, version 1.1.0:0
    Authenticated as u/somnaths
    Use 'exit' command or Ctrl-C to exit shell.
    root> data --help

    Usage: datafed data [OPTIONS] COMMAND [ARGS]...

      Data subcommands.

    Options:
      -?, -h, --help  Show this message and exit.

    Commands:
      batch   Data batch subcommands.
      create  Create a new data record.
      delete  Delete one or more existing data records.
      get     Get (download) raw data of data records and/or collections.
      put     Put (upload) raw data located at PATH to DataFed record ID.
      update  Update an existing data record.
      view    View data record information.


After identifying the command(s) we need, we can look up more information about a specific command (``data create`` in this case) as:

.. code:: bash

    root> data create --help

    Usage: datafed data create [OPTIONS] TITLE

      Create a new data record. The data record 'title' is required, but all
      other attributes are optional. On success, the ID of the created data
      record is returned. Note that if a parent collection is specified, and
      that collection belongs to a project or other collaborator, the creating
      user must have permission to write to that collection. The raw-data-file
      option is only supported in interactive mode and is provided as a
      convenience to avoid a separate dataPut() call.

    Options:
      -a, --alias TEXT             Record alias.
      -d, --description TEXT       Description text.
      -T, --tags TEXT              Tags (comma separated list).
      -r, --raw-data-file TEXT     Globus path to raw data file (local or remote)
                                   to upload to new record. Default endpoint is
                                   used if none provided.
      -x, --extension TEXT         Override raw data file extension if provided
                                   (default is auto detect).
      -m, --metadata TEXT          Inline metadata in JSON format. JSON must
                                   define an object type. Cannot be specified with
                                   --metadata-file option.
      -f, --metadata-file TEXT     Path to local metadata file containing JSON.
                                   JSON must define an object type. Cannot be
                                   specified with --metadata option.
      -p, --parent TEXT            Parent collection ID, alias, or listing index.
                                   Default is the current working collection.
      -R, --repository TEXT        Repository ID. Uses default allocation if not
                                   specified.
      -D, --deps <CHOICE TEXT>...  Dependencies (provenance). Use one '--deps'
                                   option per dependency and specify with a string
                                   consisting of the type of relationship ('der',
                                   'comp', 'ver') follwed by ID/alias of the
                                   referenced record. Relationship types are:
                                   'der' for 'derived from', 'comp' for 'a
                                   component of', and 'ver' for 'a new version
                                   of'.
      -X, --context TEXT           User or project ID for command alias context.
                                   See 'alias' command help for more information.
      -v, --verbosity [0|1|2]      Verbosity level of output
      -?, -h, --help               Show this message and exit.

From the documentation above, it is clear that the ``data create`` command must be issued with at least the title for the record.
Furthermore, there are several options to add other contextual information and even scientific metadata.

Scientific Metadata
===================

The majority of DataFed's benefits can be realized only when data is paired with metadata and provenance information.
The documentation above shows that scientific metadata can be specified using a JSON file or via a valid JSON string (same content as JSON file).
In realistic scientific experiments, we would expect that the volume of scientific metadata to be associated with given raw data may be
non-trivial in length.

In order to simulate the process of associating metadata with raw data, we will create a simple JSON file with arbitrary contents such as:

.. code:: bash

    {'a': True, 'b': 14}

Creating Records
================

Now that we have some metadata and we know how to use the ``data create`` function from using the help
option, we can create a record as shown below:

.. code:: bash

    root> data create \
    --alias "record_from_nersc" \ # Optional argument
    --description "Data and metadata created at NERSC" \ # Optional argument
    --metadata-file ./nersc_md.json \ # Optional argument
    "First record created at NERSC using DataFed CLI" # Title is required though

    ID:            d/31030353
    Alias:         record_from_nersc
    Title:         First record created at NERSC using DataFed CLI
    Data Size:     0
    Data Repo ID:  repo/cades-cnms
    Source:        (none)
    Owner:         somnaths
    Creator:       somnaths
    Created:       11/25/2020,08:04
    Updated:       11/25/2020,08:04
    Description:   Data and metadata created at NERSC

Note that the record was created in the user's ``root`` collection rather than in another specific collection such as within a project
since the ``--parent`` flag was not specified.

To verify that the record creation was successful, the 'ls' command can be used to list
records in the current working collection, as follows:

.. code:: bash

    root> ls

    1. d/31027390   (record_from_alcf)    First record created at ALCF
    2. d/31030353   (record_from_nersc)   First record created at NERSC using DataFed CLI
    3. d/29426537                         from_olcf

Clearly, the second record within the (user's) ``root`` collection is the record we just created.

Note that we have created a data record only with metadata and not with any actual data.
For demonstration purposes, we will use a small text file as the data file.

Uploading Raw Data
==================

.. note::

   Before attempting to upload raw data, ensure that the Globus endpoint associated with the machine
   where you use DataFed is active.

Here is how we would put raw data into record (via Globus):

.. code:: bash

    root> data put \
      --wait \ # optional - wait until Globus transfer completes
      "record_from_nersc" \ # optional - (unique) alias of record
      ./nersc_data.txt # path to data

    Task ID:             task/31030394
    Type:                Data Put
    Status:              Succeeded
    Started:             11/25/2020,08:05
    Updated:             11/25/2020,08:05

The ``data put`` initiates a Globus transfer on our behalf from the machine where the command was entered to wherever the default data repository is located.
In addition, the ``data put`` command prints out the status of the Globus transfer.
Given the small size of the data file, we elected to wait until the transfer was complete before proceeding - hence the ``wait`` flag.
Leaving that flag unset would have allowed us to proceed without waiting for the transfer to complete, for example if the size of the file wes very large.

The output of the ``data view`` command reveals that this record indeed contains a data file as seen in the ``Data Size`` and ``Source`` fields.

.. code:: bash

    root> data view "record_from_nersc"

    ID:            d/31030353
    Alias:         record_from_nersc
    Title:         First record created at NERSC using DataFed CLI
    Tags:          (none)
    Data Size:     37.0 B
    Data Repo ID:  repo/cades-cnms
    Source:        nersc#dtn/global/u2/s/somnaths/nersc_data.txt
    Extension:     (auto)
    Owner:         somnaths
    Creator:       somnaths
    Created:       11/25/2020,08:04
    Updated:       11/25/2020,08:05
    Description:   Data and metadata created at NERSC

.. note::

    All metadata associated with a data record lives in the central DataFed servers.
    However, the raw data associated with records lives in DataFed managed repositories, which could be geographically distributed.

Now, we will demonstrate how one could download the data associated with a data record.

Viewing Data Records
====================

For the purposes of this demonstration, we will be using data that was created elsewhere as the ``data view`` command shows:

.. code:: bash

    root> data view d/10314975

    ID:            d/10314975
    Alias:         cln_b_1_beline_0001
    Title:         CLN_B_1_BEline_0001
    Tags:          (none)
    Data Size:     25.7 MB
    Data Repo ID:  repo/cades-cnms
    Source:        57230a10-7ba2-11e7-8c3b-22000b9923ef/Nanophase/CLN_B_1_BEline_0001.h5
    Extension:     (auto)
    Owner:         somnaths
    Creator:       somnaths
    Created:       11/01/2019,19:54
    Updated:       11/15/2019,20:31
    Description:   (none)

Downloading Raw Data
====================

.. note::

   Before attempting to upload raw data, ensure that the Globus endpoint associated with the machine
   where you use DataFed is active.

We list the contents of the local directory using the shell ``ls`` command to show that the file we want to download / ``get`` doesn't already exist:

.. code:: bash

    root> exit # returning to bash now
    $ ls -hlt
    total 28M
    -rw-rw---- 1 somnaths somnaths   40 Nov 25 07:58 nersc_md.json
    -rw-r--r-- 1 somnaths somnaths 400K Nov  3 13:36 Translation_compiled.html
    -rw-r--r-- 1 somnaths somnaths 1.9M Nov  3 13:30 image_02.mat
    -rw-rw---- 1 somnaths somnaths   37 Nov  3 11:41 nersc_data.txt

We can download the data associated with a data record using the ``data get`` command as shown below:

.. code:: bash

    $ datafed
    Welcome to DataFed CLI, version 1.1.0:0
    Authenticated as u/somnaths
    Use 'exit' command or Ctrl-C to exit shell.

    root> data get \
      --wait \ # optional - wait for Globus transfer to complete
      d/10314975 \ # ID of data record
      . # Where to put it in local file system

    root> exit

    > ls -hlt
    total 28M
    -rw-r--r-- 1 somnaths somnaths  26M Nov 25 08:08 10314975.h5
    -rw-rw---- 1 somnaths somnaths   40 Nov 25 07:58 nersc_md.json
    -rw-r--r-- 1 somnaths somnaths 400K Nov  3 13:36 Translation_compiled.html
    -rw-r--r-- 1 somnaths somnaths 1.9M Nov  3 13:30 image_02.mat
    -rw-rw---- 1 somnaths somnaths   37 Nov  3 11:41 nersc_data.txt

As the listing of the local directory shows, we got the ``10314975.h5`` file from the ``data get`` command.

Comments
========

.. note::

    Users are recommended to perform data orchestration (especially large data movement - upload / download) operations
    outside the scope of heavy / parallel computation operations in order to avoid wasting precious wall time on compute clusters.

