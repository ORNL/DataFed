=============================
Guide to High Level Interface
=============================
This is a brief user guide that illustrates the usage of the high-level ``CommandLib`` Python API.
It is **not** meant to be an exhaustive tutorial on using ``CommandLib``.
Instead, we cover functions in ``CommandLib`` that would be used in most data orchestration scripts and custom software based on DataFed.

Users are encouraged to refer to the extensive `documentation of DataFed's CommandLib.CLI class <https://ornl.github.io/DataFed/autoapi/datafed/CommandLib/index.html>`_
for comprehensive information on all functions in the ``CommandLib.CLI`` class.

Getting Started
---------------
Users are recommended to follow the:

* `getting-started guide <../system/getting_started.html>`_ to get accounts, and allocations on DataFed
* `installation instructions <../client/install.html>`_ to install the DataFed Python package on the machine(s) where they intend to use DataFed

.. note::

   Ensure that the Globus endpoint associated with the machine where you use DataFed is active.

Import package
~~~~~~~~~~~~~~
We start by importing just the ``API`` class within ``datafed.CommandLib`` as shown below.
We also import json to simplify the process of communicating metadata with DataFed.

.. code:: python

    >>> import json # For dealing with metadata
    >>> import os # For file level operations
    >>> import time # For timing demonstrations
    >>> import datetime # To demonstrate conversion between date and time formats
    >>> from datafed.CommandLib import API

Create instance
~~~~~~~~~~~~~~~
Finally, we create an instance of the DataFed API class via:

.. code:: python

    >>> df_api = API()

We can now use ``df_api`` to communicate with DataFed

DataFed functions and responses
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Typically, users would be working in the context of a DataFed ``Project``
, which would have been created by the project's principle investigator(s) or other administrators,
rather than the user's own personal ``root`` collection.

First, let's try to find projects we are part of using the ``projectList()`` function in DataFed:

.. code:: python

    >>> plist_resp = df_api.projectList()
    >>> print(plist_resp)

    (item {
      id: "p/trn001"
      title: "TRN001 : DataFed Training"
      owner: "u/somnaths"
    }
    offset: 0
    count: 20
    total: 1
    , 'ListingReply')

DataFed typically responds to functions or messages.

It is important to get comfortable with these messages and extracting information from them
if one is interested in using this interface to automate data orchestration.

Let's dig into this object layer-by-layer:

The first layer is typically a tuple of size 2:

.. code:: python

    >>> print(type(pl_resp), len(pl_resp))

    (tuple, 2)

The first object, that we need to dig into is the core Google ``protobuf`` message:

.. code:: python

    >>> type(pl_resp[0])
    google.protobuf.internal.python_message.ListingReply

``ListingReply`` is one of the handful of different kinds of messages DataFed replies with across all its many functions.
We will be encountering most of the different message types in this user guide.

Besides the main information about the different projects, this ``ListingReply`` also provides some contextual information
such as the:

* ``count`` - Maximum number of items that could be listed in this message,
* ``total`` - Number of items listed in this message
* ``offset`` - The number of items in past listings - this denotes the concept of page numbers

Though we won't be needing the information in this case, here is how we might get the ``offset``:

.. code:: python

    >>> print(pl_resp[0].offset)
    0

Accessing the ``item`` component produces the actual listing of project in the message:

.. code:: python

    >>> len(pl_resp[0].item)
    1

Now, if we wanted to get the ``title`` field of the sole project in the listing, we would access it as:

.. code:: python

    >>> pl_resp[0].item[0].title
    "TRN001 : DataFed Training"

.. note::

    We will be accessing many fields in messages going forward.
    Users are recommended to revisit this section to remind themselves how to peel each layer of the message to get to the desired field
    since we will jump straight into the single line to access the desired information henceforth in the interest of brevity.

Set Project context
~~~~~~~~~~~~~~~~~~~

In this user guide, we will work within the context of the training project.
In order to ensure that we continue to work within this context -
create data records, collections, etc. within this space,
we will define (and later use) the first of two contextual variables:

.. code:: python

    >>> context = 'p/trn001' # Name of the DataFed training project

.. note::

    Please change the ``context`` variable to suit your own project.
    If you want to work within your own ``root`` collection,
    set ``context`` to ``None``.

Exploring projects
~~~~~~~~~~~~~~~~~~
We can take a look at basic information about a project using the ``projectView()`` function:

.. code:: python

    >>> print(df_api.projectView(context))

    (proj {
      id: "p/trn001"
      title: "TRN001 : DataFed Training"
      desc: "DataFed Training project"
      owner: "u/somnaths"
      ct: 1610905375
      ut: 1610912585
      admin: "u/stansberrydv"
      admin: "u/breetju"
      alloc {
        repo: "cades-cnms"
        data_limit: 1073741824
        data_size: 0
        rec_limit: 1000
        rec_count: 0
        path: "/data10t/cades-cnms/project/trn001/"
      }
    }
    , 'ProjectDataReply')

Note that we got a different kind of reply from DataFed - a ``ProjectDataReply`` object.
The methodology to access information in these objects is identical to that described above.
Nonetheless, this response provides some useful information such as the administrators, creation date, etc.
that might be useful for those administrating or part of several projects.

We can take a look at the contents of a project by listing everything in the project's
``root`` collection using the ``collectionItemList()`` function as shown below:

.. code:: python

    >>> df_api.collectionItemsList('root', context=context)

    (item {
       id: "c/34559341"
       title: "breetju"
       alias: "breetju"
       owner: "p/trn001"
       notes: 0
     }
     item {
       id: "c/34559108"
       title: "PROJSHARE"
       alias: "projshare"
       owner: "p/trn001"
       notes: 0
     }
     item {
       id: "c/34558900"
       title: "somnaths"
       alias: "somnaths"
       owner: "p/trn001"
       notes: 0
     }
     item {
       id: "c/34559268"
       title: "stansberrydv"
       alias: "stansberrydv"
       owner: "p/trn001"
       notes: 0
     }
     offset: 0
     count: 20
     total: 4, 'ListingReply')

Just as in the ``projectList()`` function, this function too returns a ``ListingReply`` message.
Here, we see that the administrator of the project has created some collections for the private
use of project members and a collaborative space called ``PROJSHARE``

.. note::

    Not all projects would be structured in this manner.

Set User context
~~~~~~~~~~~~~~~~
Now, that we see that a collection does indeed exist for each user in the project,
we can set the second portion of our context such that any data we want to create in our
private space is created in our own collection (``somnaths`` in this case) rather than
creating clutter in the ``root`` collection of the project:

.. code:: python

    >>> username = 'somnaths' # Name of this user

.. note::

    Please change the ``username`` variable to suit your own project.
    If you want to work within your own ``root`` collection,
    set ``username`` to ``root``.

Here ``username`` will be used to ensure that all records and collections are created
within this parent collection.

Create Data Record
------------------

Prepare (scientific) metadata
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
DataFed can accept metadata as dictionaries in python or as a JSON file.

Here, we simply create a dictionary with fake metadata in place of the real metadata:

.. code:: python

    >>> parameters = {
                      'a': 4,
                      'b': [1, 2, -4, 7.123],
                      'c': 'Something important',
                      'd': {'x': 14, 'y': -19} # Can use nested dictionaries
                      }

Create the record
~~~~~~~~~~~~~~~~~
Until a future version of DataFed, which can accept a python dictionary itself instead
of a JSON file or a JSON string for the metadata, we will need to use ``json.dumps()``
or write the dictionary to a JSON file:

.. code:: python

    >>> response = df_api.dataCreate('my important data',
                                     alias='my_alias', # optional
                                     metadata=json.dumps(parameters), # also optional
                                     parent_id='root', # parent collection
                                    )

.. note::

   Use the ``parent_id`` keyword argument to create the record within a
   specific collection, for example within a project.

Here, the ``parent_id`` was set to the default value of ``root`` which means that
the Data Record would be created within the user's private collection.

We encourage users to create a variable in the very beginning of the script
capturing information about the starting location where DataFed Records
would be created and operated on. This variable could be used for the ``parent_id``.

Reading DataFed response
~~~~~~~~~~~~~~~~~~~~~~~~
DataFed returns Google Protobuf messages in response to commands (both success and failure).

Here is the response form the above ``dataCreate()`` command:

.. code:: python

    >>> print(response)

    (data {
       id: "d/30224875"
       title: "my important data"
       alias: "my_alias"
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

We would get the same response if we viewed basic information about a Data Record
using the ``dataView()`` command.

Though the content in these message objects are clearly laid out for humans to read and understand,
getting the specific components of the messages requires a tiny bit of extra indexing work.

For example, if we wanted to get the record ID to be used for later transactions,
here's how we could go about it:

.. code:: python

    >>> record_id = response[0].data[0].id
    >>> print(record_id)

    'd/30224875'

Upload raw data
---------------
So far, the Data Record created above only contains simple text information
along with the scientific metadata. It does not have the raw data that we
colloquially refer to as "data" in science.

For the sake of demonstration, we will just use the metadata as the data itself:

.. code:: python

    >>> with open('parameters.json', mode='w') as file_handle:
            json.dump(parameters, file_handle)

With the data file created, we are ready to put this raw data into the record we created above.

.. note::

   The raw data file must be located such that it is visible to the (default) Globus endpoint

.. note::

   Ensure that the Globus endpoint that will be used for uploading data is active.

.. code:: python

    >>> put_resp = df_api.dataPut(record_id,
                                  './parameters.json', # raw data file
                                  )
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

The ``dataPut()`` method initiates a Globus transfer on our behalf
from the machine where the command was entered to wherever the default data repository is located.

In addition, the ``dataPut()`` method prints out the status of the Globus transfer as shown under the ``task`` section of the response.
The ``task`` ``msg`` shows that the Globus transfer was pending and was not yet complete at the time when the response was printed.

If it is important that the code not proceed until the transfer is complete,
users are recommended to set the ``wait`` keyword argument in the ``dataPut()`` method to ``True``
and instead use:

.. code:: python

    >>> put_resp = df_api.dataPut(record_id,
                                  './parameters.json',
                                  wait=True, # Waits until transfer completes.
                                  )

View Data Record
----------------
We can get all information regarding a Data Record, except for the raw data itself, using the ``dataView()`` method.

Here we try to view the Data Record we have been working on so far:

.. code:: python

    >>> dv_resp = df_api.dataView(record_id)
    >>> prit(dv_resp)

    (data {
       id: "d/30224875"
       title: "my important data"
       alias: "my_alias"
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

Comparing this response against the response we got from the ``dataCreate()`` call,
you will notice the source and file extension have been updated.

Extract metadata
~~~~~~~~~~~~~~~~
As the response above shows, the metadata is also part of the response we got from ``dataView()``.

By default, the metadata in the response is formatted as a JSON string:

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

Download Data
-------------

.. note::

    Users are recommended to perform data orchestration (especially large data movement - upload / download) operations
    outside the scope of heavy / parallel computation operations in order to avoid wasting precious wall time on compute clusters.

