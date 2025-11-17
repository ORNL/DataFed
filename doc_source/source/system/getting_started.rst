===============
Getting Started
===============

Please follow this guide to get started with DataFed.

1. Get a Globus account
-----------------------
Follow **only Step 1** of the `instructions here <https://docs.globus.org/how-to/get-started/>`_ to create a Globus account.

2. Get a Globus ID
------------------
Ensure that your ``Globus ID`` is linked with your institutional ID in your Globus account:

1. Log in to `globus.org <https://www.globus.org>`_.
2. Click on ``Account`` on the left-hand pane.
3. Select the ``Identities`` tab in the window that opens.
4. You should see (at least) two identities:

   a. One from your home institution (listed as ``primary`` with a crown).  
   b. A Globus ID (your_username@globusid.org)

5. If you do not see the ``Globus ID``, click on ``Link another identity``. Select ``Globus ID`` and link this identity.

3. Register at DataFed
----------------------
1. Once you have a Globus ID, visit the `DataFed web portal <https://datafed.ornl.gov>`_.
2. Click on the ``Log in / Register`` button on the top-right of the page.
3. Follow the steps to register with DataFed.
4. Although you can log in to the DataFed web portal using your institutional credentials,
   you will need the username and password you set up during registration for scripting.

.. note::

    Your institutional credentials are not the same as your DataFed credentials.
    The latter are required only when using DataFed via the Python API or CLI.

4. Get data allocations
-----------------------
As the name suggests, a data allocation is the data storage space that users and projects can use to store and share their own data.
Although you can use DataFed at this point to view and access publicly shared data, it is not possible to create or manipulate your own data
unless you have a data allocation on a DataFed data repository.

Users are encouraged to request an allocation from the **principal investigator** of the project and/or the IT administrator of the facility using DataFed.
Make sure to communicate your DataFed user ID to administrators or collaborators so you can be added to projects, provided data allocations, etc.

.. note::

    Completing the steps so far is sufficient for users to view, edit, and manage metadata on DataFed.
    However, to upload and download data, users are recommended to complete the next few steps.

5. Install / identify Globus Endpoint
-------------------------------------
You will need a `Globus endpoint <https://docs.cades.ornl.gov/#data-transfer-storage/globus-endpoints/>`_ on **every machine** where you intend to download or upload data.

High-performance compute clusters
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Most high-performance computing clusters will already have at least one endpoint configured. See the table below for some popular examples:

+----------+---------------------------------+-------------------------------------------------------------------------------------------+
| Facility | Machine(s)                      | Endpoint                                                                                  |
+==========+=================================+===========================================================================================+
| OLCF     | Summit, Andes, JupyterHub       | `olcf#dtn <https://docs.olcf.ornl.gov/data/transferring.html>`_                           |
+----------+---------------------------------+-------------------------------------------------------------------------------------------+
| ALCF     | Theta                           | `alcf#dtn_theta <https://www.alcf.anl.gov/support-center/theta/using-globus-theta>`_      |
+----------+---------------------------------+-------------------------------------------------------------------------------------------+
| ALCF     | Mira, Cooley                    | `alcf#dtn_mira <https://www.alcf.anl.gov/support-center/cooley/globus-cooley>`_           |
+----------+---------------------------------+-------------------------------------------------------------------------------------------+
| NERSC    | Cori                            | `nersc#dtn  <https://docs.nersc.gov/services/globus/>`_                                   |
+----------+---------------------------------+-------------------------------------------------------------------------------------------+
| CADES    | CADES Open Research             | `cades#CADES-OR <https://docs.cades.ornl.gov/#data-transfer-storage/globus-endpoints/>`_  |
+----------+---------------------------------+-------------------------------------------------------------------------------------------+
| CADES    | CADES Moderate Research         | `cades#CADES-MOD <https://docs.cades.ornl.gov/#data-transfer-storage/globus-endpoints/>`_ |
+----------+---------------------------------+-------------------------------------------------------------------------------------------+

If your cluster is not listed above, you may need to identify the endpoint from the cluster’s documentation or
by searching on the Globus Data Transfer web interface:

1. Log in to the Globus `web portal <https://www.globus.org>`_.
2. Select ``File Manager`` on the left-hand pane if it is not already selected.

   .. image:: ../_static/globus_endpoints/finding_endpoint_01.png

3. Start typing the name of the machine or compute facility in the search box.

   .. image:: ../_static/globus_endpoints/finding_endpoint_02.png

4. Select the option that appears most appropriate (avoid endpoints named ``test`` or those that appear project-specific).
5. If the endpoint name is not clearly listed, click the three dots icon to view details about the endpoint.
6. Scroll down until you find ``Legacy Name`` — this is the short-hand identifier for the endpoint.

   .. image:: ../_static/globus_endpoints/finding_endpoint_03.png

The ``Endpoint UUID`` may also be used in place of the ``Legacy Name`` in the DataFed context.

.. note::

   The DataFed web portal features a built-in endpoint search capability in the data upload and download dialogs.
   Simply enter a portion of an endpoint title or legacy ID in the source or destination path input field, and DataFed will display
   matching endpoints after a brief delay.

Personal computers and workstations
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

If you plan to use DataFed to upload or download data from your own computer,
follow the `instructions here <https://docs.olcf.ornl.gov/data/transferring.html#using-globus-from-your-local-machine>`_
to install Globus Connect Personal and set up a Globus endpoint on your system.

As with high-performance computing clusters, you will need to look up information about your endpoint on the Globus web portal.
You should note either the ``Endpoint UUID`` or the ``Legacy Name`` for your endpoint.

6. Activate Globus Endpoint
---------------------------
To transfer data to or from the Globus endpoint associated with a cluster’s file system or your personal computer,
you will need to activate the endpoint identified in the previous step.
Clicking on the endpoint in the Globus web portal will prompt you to authenticate using your institution-specific credentials.
Here are `example instructions <https://docs.cades.ornl.gov/#data-transfer-storage/globus-endpoints/#activating-endpoints>`_ for activating CADES endpoints.

.. note::

   Globus endpoints remain active only for a limited time and must be reactivated when they expire.

Once activated, an endpoint remains available for transfers for a period determined by the hosting facility—typically 2 or 3 days.
It is possible to renew an endpoint’s activation before it expires from the Globus
`endpoint management page <https://app.globus.org/endpoints>`_.
DataFed data repositories use internal Globus endpoints for uploads and downloads; however, these endpoints are managed by DataFed and do not require user activation.

Programming interfaces to DataFed
---------------------------------
Although it is possible to use the web interface exclusively to manage your data,
DataFed’s Python interface and CLI are valuable tools for automating data orchestration and for accessing DataFed
when a web interface is not available (for example, when using a terminal).

Please follow the
`installation and configuration guide <https://ornl.github.io/DataFed/user/client/install.html>`_
for the client package to get started with the Python and command-line interfaces to DataFed.

