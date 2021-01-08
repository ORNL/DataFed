===============
Scripting Guide
===============

In this document, we walk the reader through the process of getting necessary accounts,
data allocations etc. so that the reader may begin to use DataFed's CLI and/or Python package
to script data orchestration tasks using DataFed.

Before scripting
~~~~~~~~~~~~~~~~

1. Get Globus ID
----------------
1. Follow only step 1 of `instructions here <https://docs.globus.org/how-to/get-started/>`_ to get a Globus account.
2. Ensure that your ``globus ID`` is linked with your institutional ID in your globus account:
    a. Log into `globus.org <www.globus.org>`_
    b. Click on ``Account`` on the left hand pane
    c. Select the ``Identities`` tab in the window that opens up
    d. You should see (at least these) two identities:

       i. One from your home institution (that is listed as ``primary`` with a crown)
       ii. Globus ID (your_username@globusid.org)

    e. If you do not see the ``Globus ID``, click on ``Link another identity``. Select ``Globus ID`` and link this ID.

2. Register at DataFed
----------------------
1. Once you have a Globus ID, visit the `DataFed web portal <https://datafed.ornl.gov>`_.
2. Click on the ``Log in / Register`` button on the top right of the page.
3. Follow the steps to register yourself with DataFed.
4. Though you can log into the DataFed web portal with your institution's credentials, you will need the username and password you set up during your registration for scripting.

3. Installing DataFed
---------------------
For this section, we will assume that you intend to use the Client CLI on a
remote machine such as an institutional cluster or HPC and that this machine has one or more Globus endpoints that can be used by all uesrs.

1. Load any python 3.5+ module or any conda environment that you intend to use.
2. Install the datafed client package via:
   ``pip install --user datafed``
3. Try typing ``datafed`` to access the DataFed CLI.
   If you encounter errors stating that datafed was an unknown command, you would need to add DataFed to your path.
   a. First, you would need to find where datafed was installed. For example, in the case of NERSC's Cori machine, datafed was installed at ``~/.local/cori/3.7-anaconda-2019.10/bin``.
   b. Next, add DataFed to the path via ``PATH=$PATH:path/to/datafed/here``. Though this works, this addition to the path is only valid for this shell session.
   It is recommended to add the path to your ``bashrc`` or ``rc`` such that datafed is loaded everytime you log in.

4. Setting up DataFed
---------------------
1. Type ``datafed setup`` into the shell. It will prompt you for your username and password.
2. Enter the credentials you set up when registering for an account on DataFed
3. Identify the Globus endpoint(s) attached to this machine from the user guide for the machine you are using.
   For example, the following endpoint can be used when using OLCF's Summit supercomputer: ``olcf#dtn``
4. Now, add this end point as your default endpoint via:
   ``datafed ep default set endpoint_name_here``

This concludes the one-time setup necessary to get started with scripting using DataFed.
You may use the interactive DataFed CLI or the Python package at this point.

5. Getting data allocations
---------------------------
Though you can start to use DataFed at this point, it would not be possible to create or manipulate data of your own
unless you have a data allocation in a DataFed data repository. It would still be possible to get and view data that are publicly shared via DataFed though.
As the name suggests, a data allocation is just the data storage space that users and projects can use to store and share data of their own.

Users are recommended to request an allocation from the principle investigator of the project and/or the IT administrator of facilities using DataFed.
Make sure to communicate your Globus user ID with administrators or collaborators so that you can be added onto projects, be provided data allocations, etc.


Shell scripting
~~~~~~~~~~~~~~~
Below, we show simple examples of how one could use DataFed's CLI to create data records in DataFed data repositories, put raw data into those records, as well as download the raw data from records.

Readers are recommended to use the DataFed CLI in this manner to track, download, upload, organize data and metadata within existing job scripts for compute runs.

.. note::

    Readers are recommended to perform data orchestration (especially large data movement - upload / download) operations
    outside the scope of heavy / parallel computation operations in order to avoid wasting precious wall time on compute clusters.

**Help and documentation:**

Readers are encouraged to refer to the extensive `documentation of DataFed's CLI <https://ornl.github.io/DataFed/user/cli/reference.html>`_ for complete information on how to interact with DataFed using its CLI.
Alternative the same documentation available online is also available via help commands within DataFed.

For example, if we knew that we wanted to perform some data related operations, but did not even know the different commands available through the CLI, we could ask for help as:

.. code:: bash

    > datafed data --help

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

    > datafed data create --help

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

    > datafed data create \
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

    > datafed ls

    1. d/31027390   (record_from_alcf)    First record created at ALCF
    2. d/31030353   (record_from_nersc)   First record created at NERSC using DataFed CLI
    3. d/29426537                         from_olcf

Clearly, the second record within the (user's) ``root`` collection is the record we just created.

Note that we have  created a data record only with metadata and not with any actual data.
For demonstration purposes, we will use a small text file as the data file.

Here is how we would put raw data into record (via Globus):

.. code:: bash

    > datafed data put \
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

    > datafed data view "record_from_nersc"

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

    > datafed data view d/10314975

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

    > ls -hlt
    total 28M
    -rw-rw---- 1 somnaths somnaths   40 Nov 25 07:58 nersc_md.json
    -rw-r--r-- 1 somnaths somnaths 400K Nov  3 13:36 Translation_compiled.html
    -rw-r--r-- 1 somnaths somnaths 1.9M Nov  3 13:30 image_02.mat
    -rw-rw---- 1 somnaths somnaths   37 Nov  3 11:41 nersc_data.txt

We can download the data associated with a data record using the ``data get`` command as shown below:

.. code:: bash

    > datafed data get \
      --wait \ # optional - wait for Globus transfer to complete
      d/10314975 \ # ID of data record
      . # Where to put it in local file system

    > ls -hlt
    total 28M
    -rw-r--r-- 1 somnaths somnaths  26M Nov 25 08:08 10314975.h5
    -rw-rw---- 1 somnaths somnaths   40 Nov 25 07:58 nersc_md.json
    -rw-r--r-- 1 somnaths somnaths 400K Nov  3 13:36 Translation_compiled.html
    -rw-r--r-- 1 somnaths somnaths 1.9M Nov  3 13:30 image_02.mat
    -rw-rw---- 1 somnaths somnaths   37 Nov  3 11:41 nersc_data.txt

As the listing of the local directory shows, we got the ``10314975.h5`` file from the ``data get`` command.

Python scripting
~~~~~~~~~~~~~~~~
Import necessary packages

.. code:: python

    >>> import json
    >>> from datafed.CommandLib import API

Create an instance of the DataFed API:

.. code:: python

    >>> df_api = API()

By default, one would need to get metadata from the simulation / measurement files.
Here, we use fake metadata in place of the real metadata:

.. code:: python

    >>> parameters = {
                      'a': 4,
                      'b': [1, 2, -4, 7.123],
                      'c': 'Something important',
                      'd': {'x': 14, 'y': -19} # Can use nested dictionaries
                      }

Creating the record:
Until the next version of DataFed, which can accept a python dictionary itself instead
of a JSON file or a JSON string for the metadata, we will need to use ``json.dumps()``
or write the dictionary to a JSON file:

.. code:: python

    >>> response = df_api.dataCreate('my important data',
                                     alias='my_cool_alias', # optional
                                     metadata=json.dumps(parameters), # also optional
                                     parent_id='root', # parent collection
                                    )

DataFed returns Google Protobuf messages in response to commands (both success and failure).
Let us take a look at an example response:

.. code:: python

    >>> print(response)

    (data {
       id: "d/30224875"
       title: "my important data"
       alias: "my_cool_alias"
       metadata: "{\"a\":4,\"b\":[1,2,-4,7.123],\"c\":\"Something important\",\"d\":{\"x\":14,\"y\":-19}}"
       repo_id: "repo/cades-cnms"
       size: 0.0
       ext_auto: true
       ct: 1605133166
       ut: 1605133166
       owner: "u/somnaths"
       creator: "u/somnaths"
       parent_id: "c/u_somnaths_root"
     }, 'RecordDataReply')

Though the content in these message objects are clearly laid out,
getting at specific components of the messages requires a tiny bit of extra work.
For example, if we wanted to get the record ID to be used for later transactions,
here's how we could go about it:

.. code:: python

    >>> record_id = response[0].data[0].id
    >>> print(record_id)

    'd/30224875'

Let's put the raw data into this record.
For the sake of simplicity, I'll just use the metadata as the data itself:

.. code:: python

    >>> with open('parameters.json', mode='w') as file_handle:
            json.dump(parameters, file_handle)

Putting the data file into record:
Note that this file must be located such that it is visible to the (default) globus endpoint

.. code:: python

    >>> put_resp = df_api.dataPut(record_id,
                                  './parameters.json')
    >>> print(put_resp)

    (item {
       id: "d/30224875"
       title: "my important data"
       size: 0.0
       owner: "u/somnaths"
     }
     task {
       id: "task/30225166"
       type: TT_DATA_PUT
       status: TS_READY
       client: "u/somnaths"
       step: 0
       steps: 2
       msg: "Pending"
       ct: 1605133526
       ut: 1605133526
       source: "1646e89e-f4f0-11e9-9944-0a8c187e8c12/Users/syz/Desktop/parameters.json"
       dest: "d/30224875"
     }, 'DataPutReply')

Viewing the record:
Clearly, you will notice the source and file extension have been updated:

.. code:: python

    >>> dv_resp = df_api.dataView(record_id)
    >>> prit(dv_resp)

    (data {
       id: "d/30224875"
       title: "my important data"
       alias: "my_cool_alias"
       metadata: "{\"a\":4,\"b\":[1,2,-4,7.123],\"c\":\"Something important\",\"d\":{\"x\":14,\"y\":-19}}"
       repo_id: "repo/cades-cnms"
       size: 86.0
       source: "1646e89e-f4f0-11e9-9944-0a8c187e8c12/Users/syz/Desktop/parameters.json"
       ext: ".json"
       ext_auto: true
       ct: 1605133166
       ut: 1605133539
       dt: 1605133539
       owner: "u/somnaths"
       creator: "u/somnaths"
       notes: 0
     }, 'RecordDataReply')

By default, the metadata in the response is a JSON string:

.. code:: python

    >>> dv_resp[0].data[0].metadata

    '{"a":4,"b":[1,2,-4,7.123],"c":"Something important","d":{"x":14,"y":-19}}'

In order to get back a python dictionary, use ``json.loads()``

.. code:: python

    >>> json.loads(dv_resp[0].data[0].metadata)

    {'a': 4,
     'b': [1, 2, -4, 7.123],
     'c': 'Something important',
     'd': {'x': 14, 'y': -19}}
