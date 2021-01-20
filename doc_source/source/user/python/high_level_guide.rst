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

Projects
--------

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

The first object, that we need to dig into is the core `Google Protocol Buffer <https://developers.google.com/protocol-buffers>`_ message:

.. code:: python

    >>> type(pl_resp[0])
    google.protobuf.internal.python_message.ListingReply

``ListingReply`` is one of the handful of different kinds of messages DataFed replies with across all its many functions.
We will be encountering most of the different message types in this user guide.

Interested users are encouraged to read official documentation and `examples about Google Protobuf <https://developers.google.com/protocol-buffers/docs/pythontutorial#where-to-find-the-example-code>`_.

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

Data Records
------------

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

Create Data Record
~~~~~~~~~~~~~~~~~~
Until a future version of DataFed, which can accept a python dictionary itself instead
of a JSON file or a JSON string for the metadata, we will need to use ``json.dumps()``
or write the dictionary to a JSON file:

.. code:: python

    >>> dc_resp = df_api.dataCreate('my important data',
                                    metadata=json.dumps(parameters),
                                    parent_id=username, # parent collection
                                    context=context, # this project
                                    )

Here, the ``parent_id`` was set to the ``username`` variable which would cause the
data record to be created within the user's personal collection within the project.
Leaving this unspecified is equivalent to the default value of ``root`` which means that
the Data Record would be created within the ``root`` collection of the project.

Leaving both the ``parent_id`` and ``context`` unspecified would have caused the
Data Record to be created within ``root`` collection in the user's ``Personal Data``

Extract Record ID
~~~~~~~~~~~~~~~~~

Let's look at the response we got for the ``dataCreate()`` function call:

.. code:: python

    >>> print(response)

    (data {
       id: "d/34682319"
       title: "my important data"
       metadata: "{\"a\":4,\"b\":[1,2,-4,7.123],\"c\":\"Something important\",\"d\":{\"x\":14,\"y\":-19}}"
       repo_id: "repo/cades-cnms"
       size: 0.0
       ext_auto: true
       ct: 1611077217
       ut: 1611077217
       owner: "p/trn001"
       creator: "u/somnaths"
       parent_id: "c/34558900"
     }, 'RecordDataReply')

DataFed returned a ``RecordDataReply`` object, which contains crucial pieces of information regarding the record.

.. note::

    In the future, the ``dataCreate()`` function would by default return only the ``ID`` of the record
    instead of such a verbose response if it successfully created the Data Record.
    We expect to be able to continue to get this verbose response through an optional argument.

    Such detailed information regarding the record can always be obtained via the ``dataView()`` function

Similar to getting the title from the project information, if we wanted to get the
record ID to be used for later operations, here's how we could go about it:

.. code:: python

    >>> record_id = response[0].data[0].id
    >>> print(record_id)

    'd/34682319'

Edit Record information
~~~~~~~~~~~~~~~~~~~~~~~
All information about Data Records, besides the unique ``ID``, can be edited later on using the
``dataUpdate()`` command. For example, if we wanted to change the title, add a human-readable
unique ``alias``, and **add** to the scientific metadata, we could as:

.. code:: python

    >>> du_resp = df_api.dataUpdate(record_id,
                                    title='Some new title for the data',
                                    alias='my_first_dataset',
                                    metadata=json.dumps({'appended_metadata': True})
                                    )
    print(du_resp)

    (data {
      id: "d/34682319"
      title: "Some new title for the data"
      alias: "my_first_dataset"
      repo_id: "repo/cades-cnms"
      size: 0.0
      ext_auto: true
      ct: 1611077217
      ut: 1611077220
      owner: "p/trn001"
      creator: "u/somnaths"
      notes: 0
    }
    update {
      id: "d/34682319"
      title: "Some new title for the data"
      alias: "my_first_dataset"
      owner: "p/trn001"
      creator: "u/somnaths"
      size: 0.0
      notes: 0
      deps_avail: true
    }
    , 'RecordDataReply')

.. note::

    In the future, the ``dataUpdate()`` command would return only an acknowledgement
    of the successful execution of the data update.

View Record information
~~~~~~~~~~~~~~~~~~~~~~~
Since the response from the ``dataCreate()`` and ``dataUpdate()`` functions does not include the
metadata, we can always get the most comprehensive information about Data Records via the ``dataView()`` function:

.. code:: python

    >>> dv_resp = df_api.dataView(record_id)
    >>> print(dv_resp)

    (data {
       id: "d/34682319"
       title: "Some new title for the data"
       alias: "my_first_dataset"
       metadata: "{\"a\":4,\"appended_metadata\":true,\"b\":[1,2,-4,7.123],\"c\":\"Something important\",\"d\":{\"x\":14,\"y\":-19}}"
       repo_id: "repo/cades-cnms"
       size: 0.0
       ext_auto: true
       ct: 1611077217
       ut: 1611077220
       owner: "p/trn001"
       creator: "u/somnaths"
       notes: 0
     }, 'RecordDataReply')

The date and time in the Data Records are encoded according to the Unix time format and
can be converted to familiar python ``datetime`` objects via ``fromtimestamp()``:

.. code:: python

    >>> datetime.datetime.fromtimestamp(dv_resp[0].data[0].ct)

    datetime.datetime(2021, 1, 19, 12, 26, 57)


Extract metadata
~~~~~~~~~~~~~~~~
As the response above shows, the metadata is also part of the response we got from ``dataView()``.

By default, the metadata in the response is formatted as a JSON string:

.. code:: python

    >>> dv_resp[0].data[0].metadata

    "{\"a\":4,\"appended_metadata\":true,\"b\":[1,2,-4,7.123],\"c\":\"Something important\",\"d\":{\"x\":14,\"y\":-19}}"


In order to get back a python dictionary, use ``json.loads()``

.. code:: python

    >>> print(json.loads(dv_resp[0].data[0].metadata))

    {'a': 4,
     'appended_metadata': True,
     'b': [1, 2, -4, 7.123],
     'c': 'Something important',
     'd': {'x': 14, 'y': -19}}

We can clearly observe that both the original and the new metadata are present in the record.

Replace metadata
~~~~~~~~~~~~~~~~
In the example above, we appended metadata to existing metadata, which is the default manner in which ``dataUpdate()`` operates.
If desired, we could completely replace the metadata by setting ``metadata_set`` to ``True`` as in:

.. code:: python

    >>> du_resp = df_api.dataUpdate(record_id,
                                    metadata=json.dumps({'p': 14, 'q': 'Hello', 'r': [1, 2, 3]}),
                                    metadata_set=True,
                                    )
    >>> dv_resp = df_api.dataView(record_id)
    >>> print(json.loads(dv_resp[0].data[0].metadata))
    {'p': 14, 'q': 'Hello', 'r': [1, 2, 3]}

Clearly, the previous metadata keys such as ``a``, ``b``, ``c``, etc. have all been replaced by the new metadata fields.

Aliases vs. IDs
~~~~~~~~~~~~~~~
So far, we have been operating and accessing information about the Data Record we just created using its
unique ID via the variable - ``record_id``.

However, DataFed also allows Data Records and Collections to be addressed via their ``alias``, which we set
when demonstrating the ``dataUpdate()`` function. Let us try to view the Record using its alias instead of its ID:

.. code:: python

    >>> dv_resp = df_api.dataView('my_first_dataset')
    >>> dv_resp

    ---------------------------------------------------------------------------
    Exception                                 Traceback (most recent call last)
    <ipython-input-15-c3238222ad56> in <module>
    ----> 1 dv_resp = df_api.dataView('my_first_dataset')
          2 dv_resp

    //anaconda/lib/python3.5/site-packages/datafed/CommandLib.py in dataView(self, data_id, details, context)
        162         msg.details = details
        163
    --> 164         return self._mapi.sendRecv( msg )
        165
        166     ##

    //anaconda/lib/python3.5/site-packages/datafed/MessageLib.py in sendRecv(self, msg, timeout, nack_except)
        299         self.send( msg )
        300         _timeout = (timeout if timeout != None else self._timeout)
    --> 301         reply, mt, ctxt = self.recv( _timeout, nack_except )
        302         if reply == None:
        303             return None, None

    //anaconda/lib/python3.5/site-packages/datafed/MessageLib.py in recv(self, timeout, nack_except)
        343         if msg_type == "NackReply" and _nack_except:
        344             if reply.err_msg:
    --> 345                 raise Exception(reply.err_msg)
        346             else:
        347                 raise Exception("Server error {}".format( reply.err_code ))

    Exception: Alias 'my_first_dataset' does not exist
    (source: dbGet:126 code:1)

The exception above reveals a few important nuances about DataFed:

* IDs are unique across DataFed and the ``context`` need not be specified
* aliases are unique only within a project or a user's ``Personal Data`` space.
  Therefore the ``context`` must be specified whenever using aliases

The above function call failed since it looked for a Data Record in the user's ``Personal Data`` with the specified alias,
which indeed does not exist.

.. note::

    In the future, DataFed will throw more meaningful Exceptions.
    For example, the above function call may result in a ``KeyError`` rather than a generic ``Exception`` object

We can still view the Data Record using the alis in place of the ID.
However, we would need to also provide ``context`` that the Record actually exists within the training Project.

Here is how we would amend the function call:

.. code:: python

    >>> dv_resp = df_api.dataView('my_first_dataset', context=context)
    >>> dv_resp

    (data {
       id: "d/34682319"
       title: "Some new title for the data"
       alias: "my_first_dataset"
       metadata: "{\"p\":14,\"q\":\"Hello\",\"r\":[1,2,3]}"
       repo_id: "repo/cades-cnms"
       size: 0.0
       ext_auto: true
       ct: 1611077217
       ut: 1611077226
       owner: "p/trn001"
       creator: "u/somnaths"
       notes: 0
     }, 'RecordDataReply')

Relationships and provenance
~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Let's say that this first dataset went through some processing step which resulted in one or more new datasets.
This processing step could be something as simple as a data cleaning operation or as complex as a multi-institutional
cross-facility workflow.
We could not only track the resultant new datasets as Data Records in DataFed but the relationships between the datasets.

.. note::

    We will cover topics related to associating raw data to Data Records in the very next section.

First, we create Data Records as we have done earlier for the new datasets using the ``dataCreate()`` function:

.. code:: python

    >>> dc2_resp = df_api.dataCreate('cleaned data',
                                      metadata=json.dumps({'cleaning_algorithm': 'gaussian_blur', 'size': 20}),
                                      parent_id=username, # parent collection
                                      context=context, # project
                                     )
    >>> clean_rec_id = dc2_resp[0].data[0].id
    >>> print(clean_rec_id)
    'd/34682715'

Next, we can establish a relationship or ``dependency`` between the original / source Data Record and the subsequent Data Record
via several methods such as within the ``dataCreate()`` function call or via a subsequent ``dataUpdate()`` call.

Dependencies in DataFed are specified as a ``list`` of relationships, themselves specified as ``list`` objects,
wherein the first item in the list is the relationship type and the second item is the identifier of the related Data Record.

As of this writing, DataFed supports the following relationships:

* ``der`` - Is derived from
* ``comp`` - Is comprised of
* ``ver`` - Is new version of

For our example, we will say that our new Record is derived from our original record via the ``dataUpdate()`` function:

.. code:: python

    >>> dep_resp = df_api.dataUpdate(clean_rec_id, deps_add=[["der", record_id]])
    >>> print(dep_resp)

    (data {
       id: "d/34682715"
       title: "cleaned data"
       repo_id: "repo/cades-cnms"
       size: 0.0
       ext_auto: true
       ct: 1611077405
       ut: 1611078386
       owner: "p/trn001"
       creator: "u/somnaths"
       deps {
         id: "d/34682319"
         alias: "my_first_dataset"
         type: DEP_IS_DERIVED_FROM
         dir: DEP_OUT
       }
       notes: 0
     }
     update {
       id: "d/34682715"
       title: "cleaned data"
       owner: "p/trn001"
       creator: "u/somnaths"
       size: 0.0
       notes: 0
       deps_avail: true
       dep {
         id: "d/34682319"
         alias: "my_first_dataset"
         type: DEP_IS_DERIVED_FROM
         dir: DEP_OUT
       }
     }, 'RecordDataReply')

The response shows that we did in fact manage to establish the ``DEP_IS_DERIVED_FROM`` relationship.

In the DataFed web interface, when one selects either the original or derived Records and
clicks on the ``Provenance`` view, we will observe that there is an
arrow originating from the original Data Record and terminating into the newly created Data Record:

.. image:: ../../_static/python_high_level/provenance.png

Data Transfer
-------------
Upload raw data
~~~~~~~~~~~~~~~
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
                                  './parameters.json',
                                  wait=True, # Waits until transfer completes.
                                  )
    >>> print(put_resp)

    (item {
       id: "d/34682319"
       title: "Some new title for the data"
       size: 0.0
       owner: "p/trn001"
     }
    task {
       id: "task/34702491"
       type: TT_DATA_PUT
       status: TS_SUCCEEDED
       client: "u/somnaths"
       step: 3
       steps: 4
       msg: "Finished"
       ct: 1611102437
       ut: 1611102444
       source: "1646e89e-f4f0-11e9-9944-0a8c187e8c12/Users/syz/Dropbox (ORNL)/Projects/DataFed_User_Engagements/Tutorial/parameters.json"
       dest: "d/34682319"
     }, 'DataPutReply')

The ``dataPut()`` method initiates a Globus transfer on our behalf
from the machine where the command was entered to wherever the default data repository is located.

In addition, the ``dataPut()`` method prints out the status of the Globus transfer as shown under the ``task`` section of the response.
The ``task`` ``msg`` shows that the Globus transfer had succeeded. The transfer succeeded before the message was returned because
the ``wait`` keyword argument in the ``dataPut()`` method was set to ``True``, meaning that we requested DataFed to not proceed
until the Globus transfer completed.

This is not the default behavior of ``dataPut()`` or ``dataGet()``.
In a later section, we will go over an example usecase when asynchronous transfers may be preferred.

Let's view the Data Record we have been working on so far:

.. code:: python

    >>> dv_resp = df_api.dataView(record_id)
    >>> prit(dv_resp)

    (data {
       id: "d/34682319"
       title: "Some new title for the data"
       alias: "my_first_dataset"
       metadata: "{\"p\":14,\"q\":\"Hello\",\"r\":[1,2,3]}"
       repo_id: "repo/cades-cnms"
       size: 86.0
       source: "olcf#dtn/gpfs/alpine/stf011/scratch/somnaths/DataFed_Tutorial/parameters.json"
       ext: ".json"
       ext_auto: true
       ct: 1611077217
       ut: 1611077286
       dt: 1611077286
       owner: "p/trn001"
       creator: "u/somnaths"
       notes: 0
     }, 'RecordDataReply')

Comparing this response against the response we got from the last ``dataView()`` call,
you will notice the ``source`` and ``file extension`` have been updated.

Download raw data
~~~~~~~~~~~~~~~~~
DataFed is also capable of getting data stored in a DataFed repository and placing it in the
local or other Globus-visible filesystem via the ``dataGet()`` function.

For demonstration purposes, we will simply download the raw data (.JSON file) that was placed into the first Data Record.

In order to avoid clashes in file-naming, ``dataGet()`` names the downloaded file by the unique ID of the Data Record
that contains the raw data. We already have a ``parameters.json`` file in our local folder and setting the ``orig_fname``
keyword argument to ``True`` would result in a clash in the file name.

Just to prove that the file download is indeed taking place, let's check to make sure that there is no other JSON file
whose name matches that of the record ID.

.. code:: python

    >>> expected_file_name = os.path.join('.', record_id.split('d/')[-1]) + '.json'
    >>> print(expected_file_name)
    ./34682319.json

    >>> print(os.path.exists(expected_file_name))
    False

Now that we know that we will not be having a file name clash, let us proceed with the ``dataGet()`` function call.

.. note::

    The current version of DataFed has a bug where ``dataGet()`` **only** accepts a ``list`` of Data Record or Collection IDs.
    Until the next version, users are recommended to put their singular ID into a ``list`` for ``dataGet()``.

.. code:: python

    >>> get_resp = df_api.dataGet([record_id], # currently only accepts a list of IDs / aliases
                                  '.', # directory where data should be downloaded
                                  orig_fname=False, # do not name file by its original name
                                  wait=True, # Wait until Globus transfer completes
                                 )
    >>> print(get_resp)
    (task {
      id: "task/34682556"
      type: TT_DATA_GET
      status: TS_SUCCEEDED
      client: "u/somnaths"
      step: 2
      steps: 3
      msg: "Finished"
      ct: 1611077310
      ut: 1611077320
      source: "d/34682319"
      dest: "olcf#dtn/gpfs/alpine/stf011/scratch/somnaths/DataFed_Tutorial"
    }
    , 'TaskDataReply')

The response shows that the Globus file transfer to the local file system did indeed complete successfully.
Now, let us verify that the file does indeed exist as it should:

.. code:: python

    >>> print(os.path.exists(expected_file_name))
    True

At this point, we are free to rename the downloaded file to whatever name we want using familiar python functions:

.. code:: python

    >>> os.rename(expected_file_name, 'duplicate_parameters.json')

Tasks
~~~~~
DataFed makes it possible to check on the status of transfer tasks in an easy and programmatic manner.

From the earlier ``dataGet()`` function call's response, we can extract the ``task id`` as:

.. code:: python

    >>> task_id = get_resp[0].task[0].id
    >>> print(task_id)
    task/34682556

Using the task ID, we can check on the status of the ``task`` via the ``taskView()`` function:

.. code:: python

    >>> task_resp = df_api.taskView(task_id)
    >>> print(task_resp)

    (task {
      id: "task/34682556"
      type: TT_DATA_GET
      status: TS_SUCCEEDED
      client: "u/somnaths"
      step: 2
      steps: 3
      msg: "Finished"
      ct: 1611077310
      ut: 1611077320
      source: "d/34682319"
      dest: "1646e89e-f4f0-11e9-9944-0a8c187e8c12/Users/syz/Dropbox (ORNL)/Projects/DataFed_User_Engagements/Tutorial"
    }
    , 'TaskDataReply')

The ``TaskDataReply`` shows that the ``status`` is indeed a success and the ``msg`` is ``"Finished"``.

This specific example by itself was trivial since we had already requested that the ``dataGet()`` function call
not complete till the transfer was complete.
Furthermore, the nature of the transfer was also trivial in that it was a single file located in a single DataFed
repository being delivered to a single destination.

.. note::

    A DataFed ``task`` may itself contain / be responsible for several Globus file transfers.

As the structure of the ``dataGet()`` function call suggests, one could request several Data Records or
Data Collections (themselves containing thousands of Data Records or even Collections) be downloaded,
regardless of their location (several DataFed data repositories spread across the world in multiple institutions / continents).
In this case, the ``task`` would be a composite of several Globus data transfers.

We can also extract the status of the ``task`` as:

.. code:: python

    >>> task_resp[0].task[0].status
    3

Note that though the status was marked as ``TS_SUCCEEDED`` in the Google Protobuf object,
we got an integer value for the status.
For now, we will use the numeric value of ``3`` to denote the successful completion of a file transfer task.

.. note::

    A future version of DataFed may change the nature of the output / type for the ``status``
    property. In general, the exact return object types and nomenclature may evolve with DataFed.

Asynchronous transfers
~~~~~~~~~~~~~~~~~~~~~~
So far we have been requesting that all transfers be completed before the next line of
python code is executed. This is certainly acceptable for small data file but is perhaps not
ideal for large files.

Here are some scenarios:

* We are performing an array of simulations and want data transfers for a completed
  simulation to take place in the background while the subsequent simulation is being
  computed.
* We may want to get multiple Data Records or Collections which may
  actually be spread over multiple DataFed data repositories or Projects, etc.
* One could conceivably need to launch a child process to perform some operations
  while transfers took place asynchronously.

Before we demonstrate a simple example, let us define some handy functions:

The first is our fake, computationally expensive simulation denoted by ``expensive_simulation()`` that just sleeps for 3 seconds.
It generates results that are written to a ``.dat`` file and it returns the path to this
results data file. Though comically oversimplified, it is sufficiently accurate for demonstration purposes.

.. code:: python

    >>> def expensive_simulation():
            time.sleep(3)
            # Yes, this simulation is deterministic and always results in the same result:
            path_to_results = 'esnet#cern-diskpt1/data1/5MB-in-tiny-files/a/a/a-a-1KB.dat'
            return path_to_results

The next handy function is ``check_xfer_status()`` that looks up the instantaneous status of the transfer
of each task it is provided and returns only the statuses:

.. code:: python

    >>> def check_xfer_status(task_ids):
            statuses = list()
            for this_task_id in task_ids:
                task_resp = df_api.taskView(this_task_id)
                statuses.append(task_resp[0].task[0].status)
            return statuses

In the following demonstration, we perform a series of "computationally expensive" simulations.

Following our aim to mimic realistic scenarios, we also create a DataFed collection to hold
all the simulation results:

.. code:: python

    >>> coll_resp = df_api.collectionCreate('Simulations', parent_id=username, context=context)
    >>> sim_coll_id = coll_resp[0].coll[0].id

Knowing that the simulations take a while to complete,
we create a Data Record to hold each simulation's resulting data file and then call ``dataPut()``
to asynchronously upload the data in the background without impeding the following simulation
or, importantly - wasting precious wall time on the supercomputer.

.. code:: python

    >>> xfer_tasks = list()
    >>> print('~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~')
    >>> for ind in range(3):
            print('Starting simulation #{}'.format(ind))
            results_file = expensive_simulation()
            rec_resp = df_api.dataCreate('Simulation_' + str(ind),
                                         metadata=json.dumps({'parameter_1': ind}),
                                         parent_id=sim_coll_id,
                                         context=context)
            this_rec_id = rec_resp[0].data[0].id
            print('Uploading data from simulation #{}'.format(ind))
            put_resp = df_api.dataPut(this_rec_id, results_file, wait=False)
            xfer_tasks.append(put_resp[0].task.id)
            print('Transfer status(es): {}'.format(check_xfer_status(xfer_tasks)))
            print('')

    >>> print('Simulations complete')

    ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~
    Starting simulation #0
    Uploading data from simulation #0
    Transfer status(es): [2]

    Starting simulation #1
    Uploading data from simulation #1
    Transfer status(es): [3, 2]

    Starting simulation #2
    Uploading data from simulation #2
    Transfer status(es): [3, 3, 2]

    Simulations complete

What we observe is that the data upload transfer task for all previous simulations are complete while the current simulation is in progress.
Of course, the sequence and competing speeds of the simulation and the data transfer task will vary from one workload to another and
this is just an illustration. However, it does illustrate a popular use-case for asynchronous file transfers.

Task-based triggers
~~~~~~~~~~~~~~~~~~~

Here we demonstrate a simple example where we wait till 3 separate ``dataGet()``
functions

.. code:: python

    records_to_download = ['d/34571256', 'd/34572087', 'd/34572329']
    [42]:

    df_api.dataView('d/34571256')
    [42]:
    (data {
       id: "d/34571256"
       title: "10 MB data"
       alias: "010mb"
       desc: "Generic 10 MB data from ESNet"
       repo_id: "repo/cades-cnms"
       size: 10000000.0
       source: "esnet#newy-dtn/data1/10M.dat"
       ext: ".dat"
       ext_auto: true
       ct: 1610920711
       ut: 1610921093
       dt: 1610920906
       owner: "u/somnaths"
       creator: "u/somnaths"
       notes: 0
     }, 'RecordDataReply')

.. note::

    Could just transfer all of them in one task even if they were all located in different data repositories (i.e - required different globus transfers)

.. note::

    HPCs have multiple DTNs

.. code:: python

    task_ids = list()
    ​
    # initiate transfer
    get_resp = df_api.dataGet([records_to_download[0]], '.', orig_fname=False, wait=False)
    # capture the task ID:
    task_ids.append(get_resp[0].task.id)
    ​
    # Perform some other activity here...
    ​
    # initiate transfer
    get_resp = df_api.dataGet([records_to_download[1]], '.', orig_fname=False, wait=False)
    # capture the task ID:
    task_ids.append(get_resp[0].task.id)
    ​
    # Perform some other activity here...
    ​
    # initiate transfer
    get_resp = df_api.dataGet([records_to_download[2]], '.', orig_fname=False, wait=False)
    # capture the task ID:
    task_ids.append(get_resp[0].task.id)
    ​
    print('Task IDs')
    print(task_ids)
    ​
    this_iter = 0
    max_iter = 20
    wait = 1
    while this_iter < max_iter:
        # Check status
        statuses = list()
        for this_task_id in task_ids:
            task_resp = df_api.taskView(this_task_id)
            statuses.append(task_resp[0].task[0].status)
        all_stat = [this_status == 3 for this_status in statuses]
        if all(all_stat):
            print('All downloads complete! exiting')
            break
        print('Time elapsed: {} sec - One or more transfers not yet complete: {}'.format(wait * this_iter, all_stat))
        this_iter += 1
        time.sleep(wait)

    # submit major data analytics job now

    Task IDs
    ['task/34683463', 'task/34683475', 'task/34683487']
    Time elapsed: 0 sec - One or more transfers not yet complete: [False, False, False]
    Time elapsed: 1 sec - One or more transfers not yet complete: [False, False, False]
    Time elapsed: 2 sec - One or more transfers not yet complete: [False, False, False]
    Time elapsed: 3 sec - One or more transfers not yet complete: [False, False, False]
    Time elapsed: 4 sec - One or more transfers not yet complete: [False, False, False]
    Time elapsed: 5 sec - One or more transfers not yet complete: [False, False, False]
    Time elapsed: 6 sec - One or more transfers not yet complete: [False, False, False]
    Time elapsed: 7 sec - One or more transfers not yet complete: [False, False, False]
    Time elapsed: 8 sec - One or more transfers not yet complete: [False, False, False]
    Time elapsed: 9 sec - One or more transfers not yet complete: [False, False, False]
    Time elapsed: 10 sec - One or more transfers not yet complete: [False, False, False]
    Time elapsed: 11 sec - One or more transfers not yet complete: [False, False, False]
    Time elapsed: 12 sec - One or more transfers not yet complete: [True, False, True]
    All downloads complete! exiting

.. note::

    Users are recommended to perform data orchestration (especially large data movement - upload / download) operations
    outside the scope of heavy / parallel computation operations in order to avoid wasting precious wall time on compute clusters.

Collections
-----------
Collections are a great tool to organize Data Records and other Collections within DataFed.
Besides organization, they have other benefits such as facilitating the download of vast numbers of Data Records they may contain,
regardless of where (DataFed data repositories, various projects, etc.) the individual Data Records are physically located.

Create collection
~~~~~~~~~~~~~~~~~
The process to create a Collection is very similar to that for the Data Record.
We would use the ``collectionCreate()`` function as:

.. code:: python

    coll_alias = 'cat_dog_train'
    ​
    coll_resp = df_api.collectionCreate('Image classification training data',
                                        alias=coll_alias,
                                        parent_id=username,
                                        context=context)
    print(coll_resp)

    (coll {
      id: "c/34683877"
      title: "Image classification training data"
      alias: "cat_dog_train"
      owner: "p/trn001"
      ct: 1611078472
      ut: 1611078472
      parent_id: "c/34558900"
    }
    , 'CollDataReply')

Much like Data Records, Collections could be addressed using aliases instead of IDs.
However, as mentioned earlier, we would always need to specify the ``context`` for the ``alias``.

What we get in response to the ``collectionCreate()`` function is a ``CollDataReply`` object.
It contains some high-level identification information such as the ``id``, ``alias``, ``parent_id``, etc.
It does not contain other information such as the number of Data Records within the collection itself.

We could peel the ``id`` of this newly created Collection out of the message reply if we wanted to,
just as we did for the Data Record. However, we will just use the ``alias`` for now.

.. note::

    Collections have IDs starting with ``c/`` just like Data Record IDs start with ``d/``
    and Project IDs start with ``p/``.

Populate with Records
~~~~~~~~~~~~~~~~~~~~~
Let's say that we wanted to put training data for a machine learning application into this collection.
We could go ahead and populate the Collection with Data Records by using the ``dataCreate()`` function
for each Data Record in the Collection.

In our example, we are interested in gathering examples of cats and dogs to train a machine learning model.
For simplicity, we will use the same tiny dataset for both cats and dogs.
The Data Records would be distinguishable via the ``animal`` key or field in the ``metadata``.
Since we need to create several Data Records for dogs and cats, we will define a quick function:

.. code:: python

    >>> import random

    >>> def generate_animal_data(is_dog=True):
            this_animal = 'cat'
            if is_dog:
                this_animal = 'dog'
            # To mimic a real-life scenario, we append a number to the animal type to denote
            # the N-th example of a cat or dog. In this case, we use a random integer.
            rec_resp = df_api.dataCreate(this_animal + '_' + str(random.randint(1, 100)),
                                         metadata=json.dumps({'animal': this_animal}),
                                         parent_id=coll_alias,
                                         context=context)
            # Parse the dataCreate response to tease out the ID of the Record
            this_rec_id = rec_resp[0].data[0].id
            # path to the file containing the raw data
            raw_data_path = 'esnet#newy-dtn/data1/5MB-in-tiny-files/a/a/a-a-1KB.dat'
            # Putting the raw data into the record
            put_resp = df_api.dataPut(this_rec_id, raw_data_path)
            # Only returning the ID of the Data Record we created:
            return this_rec_id

In the above function, we use a tiny dataset from ESNet's read-only Globus endpoint: ``esnet#newy-dtn``.
The actual data itself is of little relevance to this example and will not really be used.

.. tip::

    So far, we have only been providing the relative path to data when we use ``dataCreate()``.
    ``dataCreate()`` automatically gets the absolute path of the path in the local file system
    and takes the UUID / legacy name of the Globus endpoint we set as default for this local file system.

    However, we can also provide the name of the Globus endpoint followed by the absolute path of the
    desired file (or directory) from that Globus endpoint.

Now, we simply call the ``generate_animal_data()`` function to generate data.
We will generate 5 examples each of cats and dogs:

.. code:: python

    >>> cat_records = list()
    >>> dog_records = list()
    >>> for _ in range(5):
            dog_records.append(generate_animal_data(is_dog=True))
    >>> for _ in range(5):
            cat_records.append(generate_animal_data(is_dog=False))
    >>> print(cat_records)
    ['d/34684011', 'd/34684035', 'd/34684059', 'd/34684083', 'd/34684107']
    >>> print(dog_records)
    ['d/34683891', 'd/34683915', 'd/34683939', 'd/34683963', 'd/34683987']

List items in Collection
~~~~~~~~~~~~~~~~~~~~~~~~

Now that we have generated the data into our Collection, we can list the contents of the Collection
simply via ``collectionItemList()`` as shown below. Again, since we are using the ``alias`` as the
identifier, we do need to specify the ``context`` as well:

.. code:: python

    >>> coll_list_resp = df_api.collectionItemsList(coll_alias, context=context)
    >>>  print(coll_list_resp)

    (item {
      id: "d/34684107"
      title: "cat_22"
      owner: "p/trn001"
      creator: "u/somnaths"
      size: 0.0
      notes: 0
    }
    item {
      id: "d/34684011"
      title: "cat_32"
      owner: "p/trn001"
      creator: "u/somnaths"
      size: 0.0
      notes: 0
    }
    item {
      id: "d/34684035"
      title: "cat_6"
      owner: "p/trn001"
      creator: "u/somnaths"
      size: 0.0
      notes: 0
    }
    item {
      id: "d/34684083"
      title: "cat_93"
      owner: "p/trn001"
      creator: "u/somnaths"
      size: 0.0
      notes: 0
    }
    item {
      id: "d/34684059"
      title: "cat_96"
      owner: "p/trn001"
      creator: "u/somnaths"
      size: 0.0
      notes: 0
    }
    item {
      id: "d/34683939"
      title: "dog_3"
      owner: "p/trn001"
      creator: "u/somnaths"
      size: 0.0
      notes: 0
    }
    item {
      id: "d/34683915"
      title: "dog_63"
      owner: "p/trn001"
      creator: "u/somnaths"
      size: 0.0
      notes: 0
    }
    item {
      id: "d/34683891"
      title: "dog_70"
      owner: "p/trn001"
      creator: "u/somnaths"
      size: 0.0
      notes: 0
    }
    item {
      id: "d/34683987"
      title: "dog_71"
      owner: "p/trn001"
      creator: "u/somnaths"
      size: 0.0
      notes: 0
    }
    item {
      id: "d/34683963"
      title: "dog_8"
      owner: "p/trn001"
      creator: "u/somnaths"
      size: 0.0
      notes: 0
    }
    offset: 0
    count: 20
    total: 10
    , 'ListingReply')

From the above response, it is clear that we have 5 examples each for dogs and cats and that
this Collection does not contain any other Collections or Data Records.

.. note::

    If we had several dozens, hundreds, or even thousands of items in a Collection,
    we would need to call ``collectionItemsList()`` multiple times
    by stepping up the ``offset`` keyword argument each time to get the next "page" of results.

Queries
-------
Let's say that we want to segregate the cat data from the dog data and that
we did not already have the record IDs separated in the ``dog_records`` and ``cat_records`` variables.

One way to do this with the tools we have demonstrated so far might be to
use ``collectionItemsList()`` to enumerate all the records, extract the ``title`` of each of the Records
and then parse the information to separate cats from dogs.
If we did not have meaningful titles, we would have had to call ``dataView()`` to get the ``metadata``
of each of the Records to separate cats from dogs.

Obviously, these are highly sub-optimal solutions to the problem.
The ideal solution is to use the search capability in DataFed.

Create query
~~~~~~~~~~~~
While it is technically possible to construct queries using hte c

.. image:: ../../_static/python_high_level/search_01.png

.. image:: ../../_static/python_high_level/search_02.png

.. image:: ../../_static/python_high_level/search_03.png

.. note::

    query language is likely to change in the future

List, view and execute query
~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. code:: python

    ql_resp = df_api.queryList()
    ql_resp
    [56]:
    (item {
       id: "q/34684970"
       title: "find_all_cats"
     }
     offset: 0
     count: 20
     total: 1, 'ListingReply')
    [58]:

    query_id = ql_resp[0].item[0].id
    query_id
    [58]:
    'q/34684970'
    [59]:

    df_api.queryView(query_id)
    [59]:
    (query {
       id: "q/34684970"
       title: "find_all_cats"
       query: "{\"meta\":\"animal == \\\"cat\\\"\",\"scopes\":[{\"scope\":4,\"id\":\"c/34683877\",\"recurse\":true}]}"
       owner: "u/somnaths"
       ct: 1611078781
       ut: 1611078781
     }, 'QueryDataReply')
    [60]:

    query_resp = df_api.queryExec(query_id)
    print(query_resp)
    (item {
      id: "d/34684011"
      title: "cat_32"
      owner: "p/trn001"
      creator: "u/somnaths"
      size: 1000.0
      notes: 0
    }
    item {
      id: "d/34684035"
      title: "cat_6"
      owner: "p/trn001"
      creator: "u/somnaths"
      size: 1000.0
      notes: 0
    }
    item {
      id: "d/34684059"
      title: "cat_96"
      owner: "p/trn001"
      creator: "u/somnaths"
      size: 1000.0
      notes: 0
    }
    item {
      id: "d/34684083"
      title: "cat_93"
      owner: "p/trn001"
      creator: "u/somnaths"
      size: 1000.0
      notes: 0
    }
    item {
      id: "d/34684107"
      title: "cat_22"
      owner: "p/trn001"
      creator: "u/somnaths"
      size: 1000.0
      notes: 0
    }
    , 'ListingReply')


.. code:: python

    cat_rec_ids = [record.id for record in query_resp[0].item]
    [62]:

    set(cat_rec_ids) == set(cat_records)
    [62]:
    True

Collections again
-----------------

Organize with Collections
~~~~~~~~~~~~~~~~~~~~~~~~~

.. code:: python

    coll_resp = df_api.collectionCreate('Cats', alias='cats', parent_id=coll_alias, context=context)
    print(coll_resp)
    (coll {
      id: "c/34685092"
      title: "Cats"
      alias: "cats"
      owner: "p/trn001"
      ct: 1611078867
      ut: 1611078867
      parent_id: "c/34683877"
    }
    , 'CollDataReply')

.. note::

    DO NOT simply list the collection, look into the metadata of each record, and then call Get
    [64]:

.. code:: python

    cat_coll_id = coll_resp[0].coll[0].id
    cat_coll_id
    [64]:
    'c/34685092'

Add and remove from Collections
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. code:: python

    cup_resp = df_api.collectionItemsUpdate(cat_coll_id, add_ids=cat_rec_ids)
    print(cup_resp)
    (, 'ListingReply')
    [66]:

    df_api.collectionItemsList(cat_coll_id)
    [66]:
    (item {
       id: "d/34684107"
       title: "cat_22"
       owner: "p/trn001"
       creator: "u/somnaths"
       size: 1000.0
       notes: 0
     }
     item {
       id: "d/34684011"
       title: "cat_32"
       owner: "p/trn001"
       creator: "u/somnaths"
       size: 1000.0
       notes: 0
     }
     item {
       id: "d/34684035"
       title: "cat_6"
       owner: "p/trn001"
       creator: "u/somnaths"
       size: 1000.0
       notes: 0
     }
     item {
       id: "d/34684083"
       title: "cat_93"
       owner: "p/trn001"
       creator: "u/somnaths"
       size: 1000.0
       notes: 0
     }
     item {
       id: "d/34684059"
       title: "cat_96"
       owner: "p/trn001"
       creator: "u/somnaths"
       size: 1000.0
       notes: 0
     }
     offset: 0
     count: 20
     total: 5, 'ListingReply')
    [68]:

    df_api.collectionItemsList(coll_alias, context=context)
    [68]:
    (item {
       id: "c/34685092"
       title: "Cats"
       alias: "cats"
       owner: "p/trn001"
       notes: 0
     }
     item {
       id: "d/34684107"
       title: "cat_22"
       owner: "p/trn001"
       creator: "u/somnaths"
       size: 1000.0
       notes: 0
     }
     item {
       id: "d/34684011"
       title: "cat_32"
       owner: "p/trn001"
       creator: "u/somnaths"
       size: 1000.0
       notes: 0
     }
     item {
       id: "d/34684035"
       title: "cat_6"
       owner: "p/trn001"
       creator: "u/somnaths"
       size: 1000.0
       notes: 0
     }
     item {
       id: "d/34684083"
       title: "cat_93"
       owner: "p/trn001"
       creator: "u/somnaths"
       size: 1000.0
       notes: 0
     }
     item {
       id: "d/34684059"
       title: "cat_96"
       owner: "p/trn001"
       creator: "u/somnaths"
       size: 1000.0
       notes: 0
     }
     item {
       id: "d/34683939"
       title: "dog_3"
       owner: "p/trn001"
       creator: "u/somnaths"
       size: 1000.0
       notes: 0
     }
     item {
       id: "d/34683915"
       title: "dog_63"
       owner: "p/trn001"
       creator: "u/somnaths"
       size: 1000.0
       notes: 0
     }
     item {
       id: "d/34683891"
       title: "dog_70"
       owner: "p/trn001"
       creator: "u/somnaths"
       size: 1000.0
       notes: 0
     }
     item {
       id: "d/34683987"
       title: "dog_71"
       owner: "p/trn001"
       creator: "u/somnaths"
       size: 1000.0
       notes: 0
     }
     item {
       id: "d/34683963"
       title: "dog_8"
       owner: "p/trn001"
       creator: "u/somnaths"
       size: 1000.0
       notes: 0
     }
     offset: 0
     count: 20
     total: 11, 'ListingReply')
    [69]:

    cup_resp = df_api.collectionItemsUpdate(coll_alias, rem_ids=cat_rec_ids, context=context)
    print(cup_resp)
    (, 'ListingReply')
    [70]:

    df_api.collectionItemsList(coll_alias, context=context)
    [70]:
    (item {
       id: "c/34685092"
       title: "Cats"
       alias: "cats"
       owner: "p/trn001"
       notes: 0
     }
     item {
       id: "d/34683939"
       title: "dog_3"
       owner: "p/trn001"
       creator: "u/somnaths"
       size: 1000.0
       notes: 0
     }
     item {
       id: "d/34683915"
       title: "dog_63"
       owner: "p/trn001"
       creator: "u/somnaths"
       size: 1000.0
       notes: 0
     }
     item {
       id: "d/34683891"
       title: "dog_70"
       owner: "p/trn001"
       creator: "u/somnaths"
       size: 1000.0
       notes: 0
     }
     item {
       id: "d/34683987"
       title: "dog_71"
       owner: "p/trn001"
       creator: "u/somnaths"
       size: 1000.0
       notes: 0
     }
     item {
       id: "d/34683963"
       title: "dog_8"
       owner: "p/trn001"
       creator: "u/somnaths"
       size: 1000.0
       notes: 0
     }
     offset: 0
     count: 20
     total: 6, 'ListingReply')

Download Collection
~~~~~~~~~~~~~~~~~~~

.. code:: python

    df_api.dataGet([cat_coll_id], './cat_data')
    [71]:
    (item {
       id: "d/34684011"
       title: "cat_32"
       owner: "p/trn001"
       size: 1000.0
     }
     item {
       id: "d/34684035"
       title: "cat_6"
       owner: "p/trn001"
       size: 1000.0
     }
     item {
       id: "d/34684059"
       title: "cat_96"
       owner: "p/trn001"
       size: 1000.0
     }
     item {
       id: "d/34684083"
       title: "cat_93"
       owner: "p/trn001"
       size: 1000.0
     }
     item {
       id: "d/34684107"
       title: "cat_22"
       owner: "p/trn001"
       size: 1000.0
     }
     task {
       id: "task/34685359"
       type: TT_DATA_GET
       status: TS_READY
       client: "u/somnaths"
       step: 0
       steps: 2
       msg: "Pending"
       ct: 1611079028
       ut: 1611079028
       source: "d/34684011, d/34684035, d/34684059, d/34684083, d/34684107, ..."
       dest: "1646e89e-f4f0-11e9-9944-0a8c187e8c12/Users/syz/Dropbox (ORNL)/Projects/DataFed_User_Engagements/Tutorial/cat_data"
     }, 'DataGetReply')
    [72]:

    os.listdir('./cat_data')
    [72]:
    ['34684107.dat',
     '34684059.dat',
     '34684011.dat',
     '34684035.dat',
     '34684083.dat']