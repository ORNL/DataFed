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

.. code:: python

    dc2_resp = df_api.dataCreate('cleaned data',
                                  metadata=json.dumps({'cleaning_algorithm': 'gaussian_blur', 'size': 20}),
                                  parent_id=username, # parent collection
                                  context=context, # project
                                 )
    ​
    dc2_resp
    [31]:
    (data {
       id: "d/34682715"
       title: "cleaned data"
       metadata: "{\"cleaning_algorithm\":\"gaussian_blur\",\"size\":20}"
       repo_id: "repo/cades-cnms"
       size: 0.0
       ext_auto: true
       ct: 1611077405
       ut: 1611077405
       owner: "p/trn001"
       creator: "u/somnaths"
       parent_id: "c/34558900"
     }, 'RecordDataReply')
    [39]:

.. code:: python

    clean_rec_id = dc2_resp[0].data[0].id
    clean_rec_id
    [39]:
    'd/34682715'

.. note::

    Must past lst of list not List of tuples
    [40]:

.. code:: python

    df_api.dataUpdate(clean_rec_id, deps_add=[["der", record_id]])
    [40]:
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
                                  './parameters.json', # raw data file
                                  )
    >>> print(put_resp)

    (item {
       id: "d/34682319"
       title: "Some new title for the data"
       size: 0.0
       owner: "p/trn001"
     }
     task {
       id: "task/34682474"
       type: TT_DATA_PUT
       status: TS_READY
       client: "u/somnaths"
       step: 0
       steps: 2
       msg: "Pending"
       ct: 1611077280
       ut: 1611077280
       source: "1646e89e-f4f0-11e9-9944-0a8c187e8c12/Users/syz/Dropbox (ORNL)/Projects/DataFed_User_Engagements/Tutorial/parameters.json"
       dest: "d/34682319"
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

.. code:: python

    expected_file_name = os.path.join('.', record_id.split('d/')[-1]) + '.json'
    print(expected_file_name)
    ./34682319.json

    print(os.path.exists(expected_file_name))
    False

.. note::

    Must pass list of record ids:

.. code:: python

    get_resp = df_api.dataGet([record_id], # currently only accepts a list of IDs / aliases
                              '.', # directory where data should be downloaded
                              orig_fname=False,
                              wait=True,
                             )
    print(get_resp)
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

Response had two components - the item and the task

.. code:: python

    print(os.path.exists(expected_file_name))
    True

.. code:: python

    os.rename(expected_file_name, 'duplicate_parameters.json')
    [28]:

Tasks
~~~~~

.. code:: python

    task_id = get_resp[0].task[0].id
    print(task_id)
    task/34682556
    [29]:

.. code:: python

    task_resp = df_api.taskView(task_id)
    print(task_resp)
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

.. note::

    Don't dig too deep since stuff can change

.. code:: python

    task_resp[0].task[0].status
    [30]:
    3

Asynchronous transfers
~~~~~~~~~~~~~~~~~~~~~~

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

