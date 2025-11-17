===============
System Overview
===============

DataFed is a scientific data federation formed from a network of distributed services and data storage
repositories that enable users to create, locate, share, and access working scientific data from any
organization, facility, or workstation within the DataFed network. DataFed provides a software framework
for federating distributed raw data storage resources along with centralized metadata indexing,
data discovery, and collaboration services that combine to form a virtual "data backplane" connecting
otherwise disjoint systems into a uniform data environment. Conceptually, DataFed is a modern and domain-
agnostic "data grid" application with a host of advanced data management and collaboration features
aimed at the open science and HPC communities.

DataFed features a robust and scalable centralized data indexing and orchestration service that ties
potentially large numbers of independent DataFed data storage repositories together with high-performance
data transfer protocols and federated identity technologies. This approach prevents the formation of
independent "data silos" that suppress data discovery and access outside specific host organizations
or domains. At the same time, this architecture remains scalable because data storage and transfer loads
are distributed across many independently managed data repositories. Currently, DataFed's central services
are hosted within the Oak Ridge Leadership Computing Facility (OLCF) at the Department of Energy's Oak Ridge
National Laboratory (ORNL).

DataFed presents managed data using a *logical* view (similar to a database) rather than a direct physical
view of files in directories on a particular file system. Data that is managed by a DataFed repository is
maintained in system-controlled storage with no user-level file system access. This protects managed data
from inadvertent changes or deletions and ensures that all data read/write operations go through a DataFed
interface for proper system-wide coordination and access control. This approach helps unify and simplify
data discovery, access, and sharing, while also avoiding the inherent entropy of traditional file systems
that can lead to data misidentification, mishandling, and eventual loss of scientific reproducibility.

Cross-Facility Data Management
==============================

Figure 1, below, shows a simplified representation of an example DataFed network consisting of the central
DataFed services and several connected facilities and DataFed repositories. The enclosing gray boxes
represent the physical boundaries of geographically distributed facilities. The wide blue arrows represent
the DataFed high-speed raw data transfer "bus" (i.e., GridFTP) used to move data between facilities,
and the green arrows represent the DataFed communication "bus" used by clients to send requests to DataFed.

.. figure:: /_static/simplified_architecture.png
    :align: center

    Figure 1 - An Example DataFed Network

In this example, an observational facility and a compute facility each have a local DataFed
data repository (a cylinder labeled with an 'R'). Any facility in the system can read or write data from or to
the data repositories in the observational or compute facilities (assuming proper access permissions). However,
users within these two facilities will experience lower-latency access to the data stored there. In addition,
independent workstations can also access data in these repositories, assuming proper access permissions
are granted.

When data is stored in a DataFed repository, Globus is used to transfer a user-specified source file (as a Globus
path) into the repository, where it becomes associated with a DataFed data record. Likewise, when data is retrieved
from a DataFed repository, Globus is used to transfer the raw data of a DataFed record from the repository to a user-
specified Globus destination. Note that the raw data is copied—not moved—from the DataFed
repository. The central DataFed service maintains data record tracking information and orchestrates raw data
transfers, but never directly processes raw data.

.. note::

  DataFed provides universal storage allocation and fine-grained access control mechanisms that
  enable users at disjoint organizations to share and access data without undue burden on
  local system administrators. Local administrators can maintain and enforce data policies
  on local DataFed repositories without disrupting remote DataFed facilities or users.

Continuing with the previous example, the experimental facility shown does not have a local DataFed repository
and, instead, could use allocations on the DataFed repository within the compute facility (if, for example, these
facilities were collaborating or were managed by the same organization). In this scenario, users at the experimental
facility would store and retrieve data using a DataFed allocation granted by the compute facility, but from the users'
perspective, all DataFed interactions would behave as if the repository were local. The only noticeable
difference would be increased latency associated with DataFed data transfers.

Many cross-facility and collaborative research scenarios are supported by DataFed, and specific examples are discussed
in the DataFed :doc:`Use Cases </system/usecases>` document.

System Architecture
===================

The DataFed system is composed of a number of system components and interfaces deployed across
the DataFed network to implement scalable distributed data storage and indexing. A simplified system architecture
is shown in Figure 2, below, and includes only the central DataFed services, one DataFed data repository, and
supporting interfaces.

.. figure:: /_static/system_components.png
    :scale: 75%
    :align: center

    Figure 2 - DataFed System Components

DataFed's central services include the "Core" service, which is essentially the "brains" of DataFed. The core
service manages the metadata associated with managed raw data and also implements access control, orchestration,
and concurrency controls for data movement across the DataFed network. The core service is not directly
involved in the transfer of raw data—this function is delegated to Globus services, specifically the
GridFTP servers (managed by Globus) located at DataFed data repositories and other facilities. (The blue lines in
Figure 2 indicate high-performance raw data transfer pathways.)

The raw data storage resources within a DataFed data repository can be any form of physical storage hardware, as long
as the storage interface is supported by Globus. Currently this includes POSIX file systems and S3 object
stores. The inherent reliability of a repository's physical storage is determined by the host facility and
may range from inexpensive magnetic disks to high-speed solid-state drives or even archival-quality geographically
distributed storage systems. Local administrators control repository policies and determine which DataFed users can
utilize a repository by granting (or revoking) repository allocations. These local administrative policies and actions
have no impact on DataFed repositories at other facilities.

Figure 2 shows a DataFed repository in isolation; however, a host facility would typically integrate its DataFed
repositories with its own local storage and compute resources. For example, a facility would likely have additional
Globus endpoints that mount the primary file system(s) of the facility, and it would install high-speed
interconnects between the DataFed repository endpoint and the facility endpoint(s) to increase data transfer speeds
between the two storage systems.

The web services within the DataFed central services primarily support a web portal that allows users to easily organize
and share data from a web browser. These web services also play a critical role in authenticating DataFed users
through Globus' federated identity system (which is based on OAuth2). New DataFed users must register through the
DataFed data portal and grant specific permissions to DataFed through Globus' authorization system. These permissions
relate to user identification and enabling automatic data transfers on behalf of DataFed users.

----------
Interfaces
----------

Users can interact with DataFed through several available interfaces, including a graphical web application,
a command-line interface (CLI), and both high- and low-level application programming interfaces (APIs). The easiest
way to interact with DataFed is through the web application (see :doc:`DataFed Web Portal </user/web/portal>`), which
is also where users initially register for DataFed accounts.

The DataFed CLI and APIs are all provided through a single Python-based DataFed client package available on PyPI. Refer
to the :doc:`Client Installation </user/client/install>`, :doc:`CLI User Guide </user/cli/guide>`, and
:doc:`Python Scripting Guide </user/python/high_level_guide>` for more information.

DataFed interfaces can be used from any workstation, laptop, or compute node; however, these interfaces only provide
users with the ability to issue commands to the DataFed central service. If users also need to transfer raw
data to or from a given host machine, the local file system of that machine must be connected to a Globus endpoint.
Typically, research facilities already provide Globus endpoints to access specific local file systems; however, for
individual workstations and laptops, users will need to install Globus Personal Connect. See `DataFed Client Installation </user/client/install>`
for more information.

User Accounts
=============

Users must register with DataFed to access public or shared data records and collections; registration
is free and requires only a Globus account. (Refer to the `/system/getting_started` document for help with the
registration process.) Once registered, users are tracked internally by their Globus identity but can also be searched for
using their proper names. To create their own data records, users must have an allocation on one or more DataFed
data repositories. Please contact the IT department of a DataFed-enabled facility for assistance with
acquiring a DataFed repository allocation.

.. note::

  In a future release of DataFed, a searchable directory of available data repositories will allow
  users to request allocations directly within DataFed.

DataFed registration uses a standard Globus authentication and authorization process. When you begin the registration
process from the DataFed welcome page, you are redirected to Globus for authentication (login) using your Globus account.
Globus will then ask you to authorize DataFed to access your Globus identity and allow DataFed to transfer data on your behalf.
Once this process is complete, you are redirected to a DataFed post-registration page where you create a DataFed password.
This password is used only when manually authenticating from the DataFed command-line interface, and it can be updated from
the DataFed Web Portal at any time.

Note that DataFed will initiate data transfers only when you (or a process acting as you) explicitly request them. Further,
DataFed data transfers are restricted to transfers between DataFed data storage repositories and Globus endpoints that you have pre-authorized
(or "activated") for access. Globus endpoint activation is transient, and access expires within a period determined by the
policies of the host facility.

System Concepts
===============

DataFed provides a uniform, holistic, and logical view of the data, users, and organizational structures associated
with the federation of facilities and data storage resources that make up the DataFed network. From a user's perspective,
all data operations appear consistent within DataFed, regardless of where DataFed is accessed, where data is
physically stored, or which DataFed interface is used. To fully understand DataFed’s features and capabilities,
it is necessary to understand the underlying terminology and concepts discussed in this
section.

Because DataFed relies heavily on Globus for data transfers, it is helpful to understand the basics of how Globus works and
how to use it to move data between Globus endpoints. A good starting point for understanding Globus can be found `here <https://www.globus.org/data-transfer>`_.

---------------
Quick Reference
---------------

Below is a brief, alphabetical list of the most common DataFed terms and concepts. These topics are discussed in
greater detail in the following sections of this document.

- **Access Control** - Access controls are sets of fine-grained permissions associated with data records and/or collections that may be
  applied to specific users or groups of users.

- **Administrator** - A user designated by DOE/ORNL to have full access to DataFed administrative functions.

- **Aliases** - An alias is an optional, human-friendly alternate identifier for data records and collections.

- **Allocation** - An allocation is a storage allowance on a specific DataFed repository. One or more allocations are required
  to create DataFed data records.

- **Annotation** - Annotations are a mechanism for opening and tracking issues associated with data records and collections. Depending on
  the severity and outcome of an issue, DataFed may propagate issues to downstream data records for further impact assessment.

- **Attributes** - Attributes are searchable system-defined (fixed) metadata fields associated with certain entities (data records, collections,
  etc.) within DataFed. Textual attributes of data records and collections (e.g., title, description) are full-text indexed. The term
  "attributes" is used to avoid confusion with optional user-defined "metadata".

- **Catalog** - The DataFed catalog is a categorized searchable index of internally "published" DataFed collections. All included
  collections and contained data records are readable by any DataFed user. The catalog system is intended for sharing working, rather than static, datasets.

- **Collection** - A collection is a logical (or virtual) folder with a unique identifier and attributes that can be used to
  hierarchically organize, share, and download groups of data records and/or other collections.

- **Creator** - The user that originally creates a DataFed record becomes the owner (and creator) of the record and has full irrevocable access.

- **Data Record** - A data record is the basic unit of data within DataFed and consists of a unique identifier, attributes,
  and, optionally, raw data and domain-specific metadata.

- **Group** - A group is a user-defined set of users for applying access controls to data records or collections. Groups are not the same as projects.

- **Identifier** - Identifiers are system-unique alphanumeric strings automatically assigned to all entities within DataFed.

- **Metadata** - Metadata refers to optional searchable user-defined (domain-specific) structured information associated with data
  records. Required top-level metadata is referred to as "attributes" to avoid confusion.

- **Owner** - The user or project that originally creates a DataFed record becomes the owner and retains full access.
  Ownership can be transferred to another user or project.

- **Project** - A DataFed project is a logical grouping of users that enables collective ownership of data and simplifies collaboration.
  Projects have their own data storage allocations.

- **Project Administrator** - A user designated by a Project Owner to have managerial access to a specified project.

- **Project Owner** - Any user who creates a DataFed project and holds full access rights for that project.

- **Project Member** - A user designated by a Project Owner or Administrator to have member access to a specified project.

- **Provenance** - Provenance is metadata associated with data records that captures relationships with other data records.
  Provenance is maintained using direct links rather than identifier references in record attributes or metadata.

- **Repository** - A repository is a federated storage system located at a specific facility that stores the raw data associated with DataFed
  data records. Users and projects may be granted allocations on repositories to enable data storage.

- **Repository Administrator** - A user designated by a DataFed Administrator to have managerial access to a data repository.

- **Root Collection** - The root collection is a reserved collection that acts as the parent for all other (top-level) collections
  and data records. Each user and project has its own root collection.

- **Saved Query** - A saved query is a data search expression stored in a query object so that it can be rerun by referencing
  the query identifier. Results of saved queries are dynamic (i.e., based on matches at execution time).

- **Shared Data** - When a user grants permissions to access data records and/or collections to other users, those records and collections
  become visible as "shared data".

- **Tags** - Tags are searchable, user-defined words that may be associated with data records and collections. Tag usage is tallied internally
  to identify popular tags.

- **Task** - Tasks are trackable background processes that run on the DataFed server for longer-running operations such as data
  transfers and allocation changes.

- **User** - Any person with a DataFed account. Users are identified by their unique Globus ID, with optionally linked organizational accounts.

-----------------------
Identifiers and Aliases
-----------------------

All system "entities" in DataFed (data, collections, users, projects, etc.) are automatically assigned system-unique identifiers (IDs)
consisting of a prefix (which determines entity type) followed by an alphanumeric value. For example, "d/12345678" is
a data record identifier, and "c/87654321" is a collection identifier. The numeric portion of these IDs is not in any particular order
and can be considered essentially random but unique for a given entity type. System IDs are not easy for humans to remember and
use, so users may optionally assign human-friendly "aliases" to data records and collections.

Aliases are lowercase alphanumeric strings that may contain the letters 'a' through 'z', the numbers '0' through '9', and the
special characters '-', '_', and '.'. Aliases can be considered the equivalent of file or directory names in a file
system. A scoping prefix is automatically attached to ensure aliases are unique across all users
and projects in DataFed. These prefixes consist of the type of the alias owner ("u" for users and "p" for projects),
followed by the user or project ID, separated by colons. For example:

.. code-block:: text

  The alias "my.data" for user "u/user123" becomes "u:user123:my.data"

  and

  The alias "simulation.run.1" within project "p/stf123" becomes "p:stf123:simulation.run.1"

.. note::

  In both the DataFed web portal and the command-line interface, scoping prefixes do not need to be entered for aliases
  (nor are they displayed) except when referencing data owned by another user or project.

In general, aliases are intended to support interactive data browsing and sharing, and thus should be easy to use and understand.
Aliases should *not* be used to encode complex parameters or other details that are better represented in a data record’s
searchable metadata. This is especially important when sharing data with users who may not be familiar with an ad hoc name-based
encoding scheme.

.. note::

  Capturing and storing scientific parameters and other context as searchable, schema-based metadata results in data that
  is far more *findable* and *interoperable* than encoding this information in aliases.

------------
Data Records
------------

A data record is the basic unit of data storage within DataFed and consists, at a minimum, of an identifier and a title. A number
of additional optional informational fields can be specified, including an alias, a textual description, structured metadata,
provenance relationships, and tags. All of these data record fields are maintained centrally within DataFed and do not count
against a user's storage allocation(s). Refer to the :ref:`Field Summary`, below, for a full list of data record fields.

While metadata-only data records can be useful for specific use cases, it is likely that some form of source data will need to be
associated with a given data record. This source data is referred to as "raw data" because DataFed treats it as an opaque attachment to a
data record (i.e., DataFed cannot inspect the raw data for indexing or searching). Raw data may be any format
and any size, provided the user has sufficient allocation space. See the :ref:`Raw Data` section, below, for further details.

When creating a data record, a storage allocation on a DataFed repository must be available. If a user has multiple allocations,
an allocation can be specified or the default allocation will be used. The default allocation can be viewed and set
in the DataFed web portal. After creation, it is possible to move a record to an allocation on a different repository; if raw
data has been uploaded, it will be relocated automatically. Similarly, data record ownership can be transferred to another DataFed
user or project, and raw data will be relocated accordingly.

.. note::

  If large collections of data records are moved between allocations or to new owners, the background server task associated
  with moving raw data may take a significant amount of time. Progress can be monitored via the web portal or the CLI.

Metadata
--------

The metadata of a data record is distinct from the built-in record fields such as title and description
and is represented using JavaScript Object Notation (JSON). JSON was selected because it is human-readable, can represent
arbitrary structured documents, and is easily validated using JSON-based schemas (see `<https://json-schema.org/>`_). Like
other fields, metadata is searchable using the powerful built-in query language described in the :ref:`Data and Collection Search`
section of this document.

When creating or updating a data record, metadata may be specified directly or provided via a JSON file. When updating the metadata
of an existing data record, users may choose to replace all existing metadata or merge new metadata with existing metadata. In the
case of merging, any keys present in both the new and existing metadata will be overwritten by the new values, while other existing
keys remain unchanged and new keys are inserted.

.. note::

  Provided metadata must fully comply with the JSON specification located at `<https://tools.ietf.org/html/rfc8259>`_.

Provenance
----------

Provenance information in DataFed is maintained as direct links between any two data records and includes both a direction
and a type. Currently, three types of provenance relationships are supported, as shown in the table below. The direction of
provenance relationships is implicitly defined by setting relationship information on "dependent" data records only.

+----------------------+
| Relationship         |
+======================+
| Is Derived From      |
+----------------------+
| Is a Component Of    |
+----------------------+
| Is a Newer Version Of|
+----------------------+

Provenance direction is easiest to understand by thinking of the dependent record as the subject of the relationship statement.
For example, if data record "xyz" "is derived from" data record "pqr", then data record "xyz" is the dependent, and the provenance
relationship to record "pqr" should be set on record "xyz".

Raw Data
--------

Raw data is associated with a DataFed data record by uploading a source file from a Globus endpoint. Once uploaded, it
can be downloaded to any other Globus endpoint. Users uploading and/or downloading raw data must have appropriate
permissions on both the source/destination Globus endpoints and the DataFed record itself. When data is uploaded to a
data record, the source path, extension, and data size are captured in the data record. When downloading, users may request
either the original filename or the record identifier as the filename.

.. note::

  As with all Globus transfers, it is the user's responsibility to ensure that the source or destination endpoints are activated
  prior to initiating a raw data transfer in DataFed. This restriction is due to the inherent security design of Globus, which
  prohibits agent processes, such as DataFed, from activating endpoints on behalf of users. Note, however, that DataFed data
  repositories never require activation.

When a raw data transfer is initiated from DataFed, the transfer can be monitored using the "Task ID" of the transfer
request. In the DataFed CLI and Python API, the task ID is provided in the request output. In the DataFed web portal,
recent tasks are shown and periodically updated under the "Tasks" tab. When a transfer completes without errors,
the task status becomes "SUCCESS"; otherwise, an error message is provided. Common issues include forgetting to
activate an endpoint, endpoint activation expiring, or referencing an invalid path or filename.

Field Summary
-------------

The table below lists all of the fields of a data record. Most of these fields are
searchable using simple equality tests (i.e., ``==`` and ``!=``); however, the
``title`` and ``description`` fields are full-text indexed, enabling root-word
and phrase searches as well. When composing search expressions, the field names
shown in the third column of the table must be used.

User-specified metadata fields can be searched by prefixing the field names in
the associated JSON document with ``md.``.

================= ========= =========== ============================================
Field             Type      Name        Description
================= ========= =========== ============================================
ID                Auto      id          Auto-assigned system-unique identifier
Alias             Optional  alias       Human-friendly alternative identifier
Title             Required  title       Title of record
Description       Optional  desc        Description of record (Markdown allowed)
Tags              Optional  ---         Tag list
Metadata Schema   Optional  schema      Schema ID for metadata
Metadata          Optional  md.*        User-specified JSON document
Provenance        Optional  ---         Relationship(s) with other data records
Allocation        Default   ---         Data repository ID of allocation used
Owner             Auto      owner       User ID of current record owner
Creator           Auto      creator     User ID of original record creator
Source            Auto      source      Globus path of source raw data
Size              Auto      size        Size of raw data, in bytes
Ext               Optional  ext         Extension of raw data file
Create Time       Auto      ct          Creation timestamp (Unix)
Update Time       Auto      ut          Update timestamp (Unix)
================= ========= =========== ============================================


Collections
-----------

Collections in DataFed are a logical mechanism for organizing, sharing, and
downloading sets of data records. Data records may be placed in multiple
collections (as links), and child collections may be created to further organize
contained records. Like data records, collections have at minimum an identifier
and a title, but additional optional fields may be defined, including an alias,
a description, public access, and tags.

Unlike data records, collections do not support user-specified structured
metadata. Collections do not exclusively "own" the data records contained within
them, but certain collection operations can directly impact the records (and
child collections) they contain. There are also constraints on which data
records can be placed in a collection. These operations and constraints are as
follows:

- **Permissions** – Collections allow inheritable permissions to be set that
  apply to all contained data records and child collections. This is generally
  the preferred way to share data with other users and to control access within
  a project.

- **Single Owner** – It is not currently possible to mix data records owned by
  multiple users in a single collection. Only data records owned by the user who
  owns the collection may be linked (this applies to project collections as
  well). This restriction does *not* apply to record creators.

- **Deletion** – If a collection is deleted, all child collections, as well as
  any data records that exist *only* within the deleted collection hierarchy,
  will be deleted.

- **Downloads** – Downloading a collection will download all raw data associated
  with the contained data records, including those in child collections.
  Downloaded raw data will be placed in the user-specified destination path
  (without subdirectories). The DataFed web portal will display a download
  dialog with a selectable list of data records to include.

- **Allocation Change** – Collections can be used to change the repository
  allocations of all contained data records. Any record not already on the
  specified target allocation will be scheduled to move. Records already on the
  target allocation will be ignored. Currently, this operation can only be
  performed in the DataFed web portal.

- **Ownership Change** – Collections can be used to change the ownership of all
  contained data records. All records are moved to a specified target collection
  owned by the new owner, and the associated raw data will be scheduled for
  transfer to the new owner's default allocation. Currently, this operation can
  only be performed in the DataFed web portal.


Root Collection
---------------

All users and projects own a special "root" collection that acts as the parent
for all other (top-level) collections and/or data records. The root collection
behaves like a normal collection except that it cannot be edited or deleted.
The root collection also has a special identifier and alias derived from its
type and owner identifier:

.. code-block:: text

   For a user with an ID of "user123":
       Root collection ID:  "c/u_user123_root"
       Alias:               "u:user123:root"

   For a project with an ID of "proj123":
       Root collection ID:  "c/p_proj123_root"
       Alias:               "p:proj123:root"


Public Collections
------------------

Collections can be configured for public access. When a collection is made
public, the collection and all of its contents become discoverable and readable
by any DataFed user. Public access is enabled through the DataFed catalog
system, which allows users to browse and search for public collections and
datasets.

Please refer to the :ref:`Catalog` section for more information.

Field Summary
-------------

The table below lists all of the fields of a collection. Currently, only public collections in the
DataFed catalog can be searched, and only through the DataFed web portal. In a future release,
direct queries will be supported.

============== ======== ======== =========================================
Field          Type     Name     Description
============== ======== ======== =========================================
ID             Auto     id       Auto-assigned system-unique identifier
Alias          Optional alias    Human-friendly alternative identifier
Title          Required title    Title of record
Description    Optional desc     Description of record (markdown allowed)
Tags           Optional ---      Tag list
Access         Default  ---      Public or private (default) access
Category       Optional ---      Catalog category for public access
Owner          Auto     owner    User ID of current collection owner
Creator        Auto     creator  User ID of original collection creator
Create Time    Auto     ct       Creation timestamp (Unix)
Update Time    Auto     ut       Update timestamp (Unix)
============== ======== ======== =========================================


Projects
--------

A DataFed project is a distinct organizational unit that permits multiple users to create and manage
data records and collections as a team—without requiring project members to maintain complex access
control rules. Projects can be created by any DataFed user, but a DataFed repository allocation is
required before any data records can be created within, or transferred to, the project.

Projects have specific user roles with distinct permissions:

- **Project Owner** – The user who initially creates a project becomes the owner and has complete
  control over the project and its contained data and collections. The owner can add and remove
  project members and administrators.
- **Administrators** – These users can add and remove project members (but not other administrators),
  and can configure access control rules on the project’s root collection.
- **Members** – These users may create and update data records and collections based on the access
  control rules set by the project owner or administrators. Members always have administrative
  access to records they create.

When any user associated with a project creates a data record or collection inside a project, the
project—rather than the creating user—becomes the owner of the new record or collection. While users
still have administrative control over records and collections they create within a project, the
project’s storage allocation is used to store and manage any raw data associated with these records.


Access Controls
---------------

DataFed implements fine-grained access control through a set of permissions that can be applied to
both data records and collections. Permissions can be configured for specific users, groups, or a
combination of both, and define what actions users may take. Collections also allow the specification
of inherited permissions that apply to items linked within them.

The individual permissions are:

* **READ RECORD** – Allows reading basic information about a data record or collection.
* **READ METADATA** – Allows reading structured metadata of a data record.
* **READ DATA** – Allows downloading raw data from a data record.
* **WRITE RECORD** – Allows updating basic information of a data record or collection.
* **WRITE METADATA** – Allows updating structured metadata of a data record.
* **WRITE DATA** – Allows uploading raw data to a data record.
* **LIST** – Allows listing items linked within a collection (does not imply read access).
* **LINK** – Allows linking and unlinking items to/from a collection.
* **CREATE** – Allows new items to be created within a collection.
* **DELETE** – Allows deletion of records and collections.
* **SHARE** – Allows setting access controls on records and collections.
* **LOCK** – Allows locking a record or collection to temporarily suppress all permissions.

Multiple user- and group-scoped permissions may be applied. Permissions for a given user are evaluated
by combining all permissions set across all applicable scopes, including inherited permissions from
parent collection hierarchies. Because permissions are inherited and additive, the absence of a
permission on a given record or collection is not equivalent to denying that permission.

Access controls are typically applied to parent collections in a collection hierarchy, where contained
data and sub-collections inherit the permissions defined by the top-level parent. Collections have
both *local* and *inherited* permissions: local permissions control access to the collection record
itself, while inherited permissions are propagated to all contained records and sub-collections. Because
data records may be placed into multiple collections, the inherited permissions of *all* parent
collections are evaluated for each user.


Repository Allocations
----------------------

Having access to DataFed does not, by itself, grant users the ability to create or manage data within
DataFed. This is because DataFed does not provide raw data storage on its own, but instead relies on
*federated* storage provided by DataFed member organizations and facilities.

Federated storage is implemented through a network of geographically distributed “data repositories”
that are owned and maintained by member organizations, yet may be accessible to any DataFed user.
Typically, DataFed users with accounts at one or more DataFed member facilities are automatically
granted storage allocations on repositories managed by those organizations. For unaffiliated users,
storage allocations may be explicitly requested from DataFed member organizations.

DataFed member organizations are free to define and enforce their own data storage policies;
therefore, users requesting a storage allocation must contact the associated organization for access
information.

Unaffiliated users without storage allocations cannot create or manage their own data, but can still
locate, access, and monitor data owned by other users or projects.

Users may have multiple storage allocations across different repositories. In this case, a default
allocation may be specified, or a specific allocation chosen when creating new DataFed data records.
Data can be accessed uniformly regardless of which repository stores it; however, physical proximity
to the repository may affect access latency.


Metadata Schemas
----------------

Metadata schemas define and validate the allowed fields and field types of domain-specific metadata
associated with data records. Schemas can constrain field values (e.g., ranges, patterns) and also
define conditional constraints. Existing schemas can be referenced by new schemas as sub-documents or
as custom types for local fields.

When a schema is associated with a data record, the domain-specific metadata is validated against that
schema. If validation errors occur, the record is flagged and the validation errors are stored for
later review. Optionally, a flag in the DataFed CLI/API can be used to reject create or update
operations when metadata does not validate successfully.

DataFed’s schema implementation is based on a modified version of the JSON Schema Specification
(2020-12). The main difference is that DataFed identifies and references schemas locally instead of
via URIs to avoid external fetch latency. External schemas may still be imported and referenced using
local identifiers.


Tags
----

Tags are simple words associated with data records and collections. Tags have no inherent meaning but
are useful for organizing data in a faceted (rather than hierarchical) manner using saved queries.
Tags are tracked and reference-counted, and the web portal provides an autocomplete widget that shows
matching tags with their usage counts.


Annotations
-----------

Annotations allow users (with appropriate permissions) to attach notifications, questions, warnings,
and errors to data records. Annotations have states including *open*, *active*, and *closed*.

When created, an annotation is *open* by default and visible only to the data record’s owner/creator
and the annotation author. These parties may exchange information, and if the record owner deems the
annotation appropriate, it may be *activated*, making it visible to all users with access to the
record.

If a record has dependent records (via provenance references) and a warning or error annotation is
activated, new derived annotations are automatically created on the dependent records. Owners of those
dependent records may perform an impact assessment and either close or activate the derived
annotations. This process continues down provenance chains. This mechanism enables a form of
distributed data quality assurance even between data producers and data consumers who may not know
each other.

A future release will notify users via email when annotations on owned or derived records are created
or updated.


Data and Collection Search
--------------------------

DataFed provides a powerful search feature that allows users to locate data records and collections
within their personal space, across projects, and among shared data. Searches can be saved and accessed
via the DataFed web portal, command-line interface, and Python API.

Searchable fields include:

* **ID/Alias** – Full or partial ID or alias with wildcard support
* **Text** – Words/phrases within titles and/or descriptions (full-text indexed)
* **Tags** – Assigned tags
* **Date/Time** – “From” and “To” ranges based on record update timestamp
* **Creator** – Creator’s user ID
* **Metadata Schema** – Metadata schema ID
* **Metadata Query** – Domain-specific metadata query expression (schema-aware builder provided)
* **Metadata Errors** – Records with metadata schema validation errors


Catalog
-------

The DataFed catalog allows collections and data records to be internally published (without DOI
assignment) for discovery by any DataFed user. The catalog enables browsing by hierarchical categories
and direct searching of collections and datasets using field and metadata schema filters.

