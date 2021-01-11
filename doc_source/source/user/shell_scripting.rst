===============
Shell Scripting
===============

Below, we show simple examples of how one could use DataFed's CLI to
create data records in DataFed data repositories, put raw data into those records,
as well as download the raw data from records.

.. note::

   Users are highly encouraged to use the `python interface <./python_scripting.html>`_ for non-trivial scripting needs
   since it is easier to use returned information (especially errors) from DataFed in Python.

Users can choose to use the CLI interactively or in a scripting environment. The commands would all look and function in the same manner with few exceptions.

In order to enter the interactive mode, just type ``datafed`` into the terminal

.. code:: bash

    $ datafed
    Welcome to DataFed CLI, version 1.1.0:0
    Authenticated as u/somnaths
    Use 'exit' command or Ctrl-C to exit shell.

    root>

The ``root`` indicates the location within the user's private allocation on DataFed - the root collection.
After this point, one can type commands without needing the ``datafed`` prefix for each command (required for non-interactive / scripting mode) as in:

.. code:: bash

    root> user who
    User ID: u/somnaths

.. note::

   As of this writing, it is not possible to perform regular shell commands within the interactive mode of DataFed.
   Users are encouraged to use two terminals if one needs to interleave file-system and DataFed-specific operations.

Alternatively, one could accomplish the same command in the non-interactive mode by adding the ``datafed`` prefix:

.. code:: bash

    $ datafed user who
    User ID: u/somnaths

It would be possible to interleave bash and DataFed operations in the non-interactive / shell mode.

In this guide, we will demonstrate DataFed in the interactive mode.

**Help and documentation:**

Readers are encouraged to refer to the extensive `documentation of DataFed's CLI <https://ornl.github.io/DataFed/user/cli/reference.html>`_ for complete information on how to interact with DataFed using its CLI.
Alternative the same documentation available online is also available via help commands within DataFed.

For example, if we knew that we wanted to perform some data related operations, but did not even know the different commands available through the CLI, we could ask for help as:

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

After identifying the commands we need, we can look up more information about a specific command (``data create`` in this case) as:

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

**(Scientific) metadata:**

The majority of DataFed's benefits can be accrued only when data is paired with metadata and provenance information.
The documentation above shows that (scientific) metadata can be specified using JSON files or simply via the contents of a valid JSON file.
In realistic scientific expeditions, we expect that volume of scientific metadata that should be associated with given raw data may be
non-trivial in length.

In order to simulate the process of associating data with metadata, we will create a simple JSON file with arbitrary contents such as:

.. code:: bash

    {'a': True, 'b': 14}

**Creating a data record:**

Now that we have some metadata and we know how to use the ``data create`` function, we can create a record as shown below:

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

**Checking to make sure record was created:**

.. code:: bash

    root> ls

    1. d/31027390   (record_from_alcf)    First record created at ALCF
    2. d/31030353   (record_from_nersc)   First record created at NERSC using DataFed CLI
    3. d/29426537                         from_olcf

Clearly, the second record within the (user's) ``root`` collection is the record we just created.

Note that we have  created a data record only with metadata and not with any actual data.
For demonstration purposes, we will use a small text file as the data file.

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