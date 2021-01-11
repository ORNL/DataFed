================
Python Scripting
================
Below, we show simple examples of how one could use DataFed's Python interface to
create data records in DataFed data repositories, put raw data into those records,
as well as download the raw data from records.

Help and documentation
----------------------
Users are encouraged to refer to the extensive `documentation of DataFed's CLI class <https://ornl.github.io/DataFed/autoapi/datafed/CommandLib/index.html>`_
for complete information on how to interact with DataFed using the Python interface.

Getting Started
---------------
Users are recommended to follow our `getting-started guide <https://ornl.github.io/DataFed/system/getting_started.html>`_ to install DataFed on the machine(s) they intend to use DataFed on

.. note::

   Ensure that the Globus endpoint associated with the machine where you use DataFed is active.

Import package
~~~~~~~~~~~~~~
We start by importing just the ``API`` class within ``datafed.CommandLib`` as shown below.
We also import json to simplify the process of communicating metadata with DataFed.

.. code:: python

    >>> import json
    >>> from datafed.CommandLib import API

Create instance
~~~~~~~~~~~~~~~
Finally, we create an instance of the DataFed API class via:

.. code:: python

    >>> df_api = API()

We can now use ``df_api`` to communicate with DataFed

Create Data Record
------------------

Prepare (scientific) metadata
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Users can derive a lot more value from DataFed if they provide more contextual information about their data which can be mined or queried later on.
Therefore, users are highly encouraged to provide contextual information such as scientific metadata along with raw data.
This metadata could by any supporting information that would help the user in identifying, searching for, and organizing data.

For example, if one were performing simulations, this could be the exact combination of parameters relevant to the simulation.
Alternatively, if one were performing measurements on an instrument, the metadata could include information about the sample / system being interroaged,
measurement parameters such as resolution, speeds, spectroscopic parameters, etc.

By default, one would need to get metadata from the simulation's input parameters file or output log files.
Similarly users may need to extract header information from measurement files as the metadata for DataFed.

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
                                     alias='my_cool_alias', # optional
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
* Display contents of current director
* Get data
* Show task information
* Display contents of current directory

.. note::

    Users are recommended to perform data orchestration (especially large data movement - upload / download) operations
    outside the scope of heavy / parallel computation operations in order to avoid wasting precious wall time on compute clusters.

