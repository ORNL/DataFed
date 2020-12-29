==========
Web Portal
==========

.. attention::

    This documentation is out of date due to the rapid pace of development on the DataFed Web Portal.

The focal-point of the DataFed Web Portal is the "Data Browser" that allows users to navigate through
data, collections, and projects that they own or have access to. Depending on a users role and/or
access permission, a variety of actions may be performed on the data, collections, and projects
presented in the Data Browser (i.e. editing, sharing, etc.). Additional features include searching
with metadata-based queries, viewing recent data transfers, and managing settings. Sections 4.1
through 4.6 describe the location and function(s) of the major elements of the web portal. Note that
the web portal is implemented as a *single-page* application; therefore, web browser navigation
functions (i.e. forward/back) should not be used.

Note that DataFed web portal uses browser cookies to store user identity and context information. Once
these cookies are set, DataFed web portal tracks a user's Globus authentication status and, while
logged-in to Globus, users will be granted access to DataFed portal without requiring an additional
log-in. If a user wishes to disable web portal access, they must explicitly log-out of Globus using the
`log-out <https://www.globus.org/>`_ link.

The "Data Browser", located on the left hand side of the interface, contains a navigable tree structure
organized into categories. When an item in the browser tree is selected (by either clicking on them, or
using keyboard navigation), information about the item is displayed in the "Selection Information" panel
located to the right of the browser panel. In addition, the "action buttons" located below the data
browser may be enabled or disabled depending on what actions are valid for the selected item.

Drag and Drop
-------------

Data records and collections in the browser tree may be organized by dragging items from one location to
another. For example, data records in one collection may be dragged into another collection, or an entire
collection may be dragged into another collection - whereupon the receiving collection becomes the parent
of the moved data record or collection. By default, data records are linked into new locations when
dragged, rather than moved. To move a data record, the "Shift" key must be held while dragging the data
record. (Collections cannot be linked and are always moved.)

A data record or collection can be "unlinked" from a parent collection by holding thr "Ctrl" key and
clicking the data record. This does not delete the unlinked data record or collection, it simply removes
it from the parent collection. In the case of collections, or data records that are not linked to other
collections, unlinking will re-link the item to the root collection. This is because all data records and
collections must have a parent collection (except for root collection itself).
    
Personal Data
-------------

This category shows data records and collections owned by the current user. All actions are permitted on these data records and collections.

Project Data
------------

* This category shows projects that are owned by the current user.
  All actions are permitted on these projects.
* This category shows projects that are managed by the current user.
  Project managers are allowed to add/remove project members and set permissions on the root collection.
* This category shows projects that the current user is a member of.
  Project members are allowed to create and access data and collections per the permissions set by the project owner and/or manager.

Shared Data
-----------

This category of the shows data and collections that have been explicitly shared with the current user.
The current user is allowed to view and/or perform actions on the listed data and collections per the permissions set by the associated user or project sharing the data.

Search Results
--------------

This category shows any matching data records returned from a query initiated under the ``Search`` tab.
Actions are permitted based on permissions set by the owners of matched data records.

.. note::

    Collections will never be returned as matches.

Information Panel
-----------------

When an item in the Data Browser tree is selected, if any information about that item is available (and the current user has sufficient permissions),
it is displayed in the ``Selection Information`` panel located on the right-hand side of the web portal. The information will include the identity of the item and,
optionally, a title (or name), a description, item details, and metadata.
The ``Description``, ``Details``, and ``Metadata`` tabs may be collapsed and expanded by clicking on them.

Action Buttons
--------------

* ``New`` - Allows user to create new data records, collections, and projects. When selecting ``data`` or ``collection`` option, the current selection in the data browser will determine the default parent collection shown in the associated dialog.
* Edit - Allows users with ``ADMIN`` and/or ``WRITE_META`` permission to edit a data record or collection, or a project administrator to edit a project.
* Delete - Allows users with ``ADMIN`` permission to delete a data record or collection, or a project administrator to delete a project.
* Share - Allows users with ``ADMIN`` permission to configure access controls for a data record or collection.
* Download - Allows users with ``READ_DATA`` permission to ``get`` (download) the raw data of a data record.
* Upload - Allows users with ``WRITE_DATA`` permission to ``put`` (upload) the raw data of a data record.

Search
------

The ``Search`` tab below the action buttons allows users to query DataFed for data matching a specified metadata expression within a specified scope.


Transfers
---------

The ``Transfers`` tab below the action buttons shows recent data transfers (get/put) initiated either from DataFed Web Portal or via the CLI.

Settings
--------

The ``Settings`` tab below the action buttons allows the current user to update a number of DataFed configuration parameters, as follows:

* CLI Password - This is the password that is required when manually authenticating through DataFed CLI.
  This password is only required until the CLI ``setup`` command is used to generate and install local credentials.
* Revoke All Credentials - This button will reset ALL installed CLI credentials.
  The CLI ``setup`` command must be used to generate and install new credentials per environment.
* User Interface Theme - Allows the UI theme to set to "light" (default) or "dark".
* E-mail Address - The E-mail address that will be used to contact the current user.

These settings are saved automatically whenever they are changed.

Header and Footer
-----------------

The ``header`` is the section of the user interface at the very top of the page amd contains the title,
a ``help`` button (which opens this document), and a ``log-out`` button. The ``footer`` is located at the
very bottom of the page amd contains the status bar that displays the current user name and
informational messages.



