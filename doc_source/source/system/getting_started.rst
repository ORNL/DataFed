===============
Getting Started
===============

Please follow this guide to get started with DataFed

Universal setup
~~~~~~~~~~~~~~~

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
4. Though you can log into the DataFed web portal with your institution's credentials,
   you will need the username and password you set up during your registration for scripting.

.. note::

    Your institutional credentials are not the same as your DataFed credentials.
    The latter is only required for using DataFed via python / CLI.

3. Getting data allocations
---------------------------
As the name suggests, a data allocation is just the data storage space that users and projects can use to store and share data of their own.
Though you can start to use DataFed at this point to view and get publicly shared data, it would not be possible to create or manipulate data of your own
unless you have a data allocation in a DataFed data repository.

Users are recommended to request an allocation from the principle investigator of the project and/or the IT administrator of facility using DataFed.
Make sure to communicate your Globus user ID with administrators or collaborators so that you can be added onto projects, be provided data allocations, etc.

4. Install / identify Globus Endpoint
-------------------------------------
You will need a `Globus endpoint <https://docs.cades.ornl.gov/#data-transfer-storage/globus-endpoints/>`_ on every machine where you intend to download / upload data.

**High Performance Compute clusters:**

Most high performance computing clusters will already have at-least one endpoint already configured. See the table below for some popular examples:

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
| CADES    | CADES Open Research             | `CADES-OR <https://docs.cades.ornl.gov/#data-transfer-storage/globus-endpoints/>`_        |
+----------+---------------------------------+-------------------------------------------------------------------------------------------+
| CADES    | CADES Moderate Research         | `CADES-MOD <https://docs.cades.ornl.gov/#data-transfer-storage/globus-endpoints/>`_       |
+----------+---------------------------------+-------------------------------------------------------------------------------------------+

If your cluster is not listed above, you may need to identify the endpoint(s) from the cluster's documentation or
by searching on the Globus data transfer web interface as shown below:

1. Log into Globus' `web portal <https://globus.org>`_
2. Select ``File Manager`` on the left hand pane if it is not already selected.

   .. image:: ../_static/globus_endpoints/finding_endpoint_01.png
3. Start typing the name of the machine or compute facility in the search box

   .. image:: ../_static/globus_endpoints/finding_endpoint_02.png
4. Select the option that seems most reasonable (avoid endpoints named as ``test`` or those that seem project specific)
5. If the endpoint name is not clearly listed in the short description, click on the three dots signifying the options to view details about the endpoint
6. Scroll down the page till you find ``Legacy name``. This is the short-hand identifier for the endpoint

   .. image:: ../_static/globus_endpoints/finding_endpoint_03.png

**Personal Computers and Workstations:**

If you plan on using DataFed to upload and download data from your own computer,
you will need to `follow these instructions <https://docs.olcf.ornl.gov/data/transferring.html#using-globus-from-your-local-machine>`_
to install Globus Connect Personal and set up your own Globus endpoint on your computer.

5. Activate Globus Endpoint
---------------------------
In order to transfer from or to the Globus endpoint attached to the cluster's file system or your personal computer,
you would need to activate the Globus endpoint identified in the previous step.
Just clicking on the endpoint in the Globus web portal will prompt you to authenticate yourself with the institution-specific credentials.
Here are `example instructions <https://docs.cades.ornl.gov/#data-transfer-storage/globus-endpoints/#activating-endpoints>`_ for activating CADES' endpoints.

.. note::

   Globus endpoints are active only for a short period of time and must be reactivated if they expire.

Once the endpoint is activated, it will be active for data transfers for (typically) 3 days or so.
It is typically possible to renew / extend the endpoint activation before it expires.
Once the activation has expired, you would need to visit Globus' web portal to activate the endpoint again.

Scripting setup
~~~~~~~~~~~~~~~
Though it is indeed possible to use the web interface exclusively for managing data in DataFed,
DataFed's python interface and CLI are very handy tools for automating data orchestration and accessing DataFed
when a web interface is not available (e.g. terminal).

Please follow the following steps to get started with the scripting interfaces:

1. Install DataFed client
-------------------------

1. Load any python 3.5+ module (if you are on a compute cluster) or any python virtual environment / conda environment that you intend to use.
   If you do not have any python environment available, consider `installing miniconda <https://docs.conda.io/en/latest/miniconda.html>`_.
2. Install the datafed client package via pip:

   i. If you are using a python environment where you do not have write access to the environment (e.g. module made available in a compute cluster):

      ``pip install --user datafed``

   ii. If you have write access to the python environment (e.g. your own local environment):

       ``pip install datafed``

3. Try typing ``datafed`` to access the DataFed CLI.
   If you encounter errors stating that datafed was an unknown command, you would need to add DataFed to your path.

   a. First, you would need to find where datafed was installed. Here are some examples of where we found datafed installed on a few machines:

      i. NERSC's Cori - datafed was installed at ``~/.local/cori/3.7-anaconda-2019.10/bin``.
      ii. OLCF's Summit - datafed was installed at ``~/.local/summit/anaconda3/5.3.0/3.7/bin``

   b. Next, add DataFed to the PATH variable via one of the following methods:

      i. Type ``PATH=$PATH:path/to/datafed/here`` to add DataFed only for this shell session.
         You would need to type this command each time you log into the machine.
      ii. If you intend to use the same python environment every time and you prefer
          that DataFed is automatically loaded each time you log into the machine,
          consider adding the following lines to your ``bashrc`` or ``rc``:

          .. code:: bash

             module load my-python-module/1.2.3
             PATH=$PATH:path/to/datafed/here

      .. note::

         This only adds DataFed to the ``PATH`` at the login node of the cluster and not in the compute nodes.


3. Set up DataFed
-----------------
1. Type the following command into shell:

   .. code:: bash

       datafed setup

   It will prompt you for your username and password.
2. Enter the credentials you set up when registering for an account on DataFed
   (not your institutional credentials you use to log into the machine)
3. Add the Globus endpoint specific to this machine / file-system as the default endpoint via:

   .. code:: bash

      datafed ep default set endpoint_name_here

This concludes the one-time setup necessary to get started with scripting using DataFed.
You may use the interactive DataFed CLI or the Python package at this point.
