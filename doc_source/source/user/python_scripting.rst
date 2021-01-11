================
Python Scripting
================

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