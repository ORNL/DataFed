===============
System Overview
===============

DataFed is a scientific data federation formed from a network of distributed services and data storage
repositories that enable users to create, locate, share, and access working scientific data from any
organization, facility, or workstation within the DataFed network. DataFed provides a software framework
for the federation of distributed raw data storage resources along with centralized metadata indexing,
data discovery, and collaboration services that combine to form a virtual "data backplane" connecting
otherwise disjoint systems into a uniform data environment. Conceptually, DataFed is a modern and domain-
agnostic "data grid" application with a host of advanced data management and collaboration features
aimed at the open science and HPC communities.

DataFed features a robust and scalable centralized data indexing and orchestration service that ties
potentially large numbers of independent DataFed data storage repositories together with high-performance
data transfer protocols and federated identity technologies. This approach prevents the formation of
independent "data silos" that suppress data discovery and access from outside of specific host organizations
or domains - yet this architecture is scalable since data storage and transfer loading is distributed across
many independently managed data repositories. Currently, DataFed's central services are hosted within the
Oak Ridge Leadership Computing Facility (OLCF) at the Department of Energy's Oak Ridge National Laboratory
(ORNL).

DataFed presents managed data using a *logical* view (similar to a database) rather than a direct physical
view of files in directories on a particular file system. Data that is managed by a DataFed repository is
maintained in system-controlled storage with no user-level file system access. This is to both protect the
managed data from inadvertent changes or deletions, and to ensure that all data read/write operations go
through a DataFed interface for proper system-wide coordination and access control. This approach is a step
towards unifying and simplifying data discovery, access, and sharing - as well as avoiding the inherent
entropy of traditional file systems that can lead to data misidentification, mishandling, and an eventual
loss of scientific reproducibility.

Cross-Facility Data Management
==============================

Figure 1, below, shows a simplified representation of an example DataFed network consisting of the central
DataFed services and several connected facilities and DataFed repositories. The enclosing gray boxes
represent the physical boundaries of geographically distributed facilities. The wide blue arrows represent
the DataFed high-speed raw data transfer "bus" (i.e. GridFTP) that is used to move data between facilities,
and the green arrows represent the DataFed communication "bus" use by clients to send requests to DataFed.

..  figure:: /_static/simplified_architecture.png
    :align: center

    Figure 1 - An Example DataFed Network

In this example, there is an observational facility and a compute facility that each have a local DataFed
data repository (a cylinder labeled with an 'R'). Any facility in the system can read or write data from or to
the data repositories in the observational or compute facilities (assuming proper access permissions); however,
users within these two facilities will have lower latency access to the data stored there. In addition,
independent workstations can also access data in these repositories - also assuming proper access permissions
are granted.

When data is stored to a DataFed repository, Globus is used to transfer a user-specified source file (as a Globus
path) into the repository where it becomes associated with a DataFed data record. Likewise, when data is retrieved
from a DataFed repository, Globus is used to transfer the raw data of a DataFed record from the repository to a user-
specified Globus destination; however, note that the raw data is simply copied - not moved - from the DataFed
repository. The central DataFed service maintains data record tracking information and orchestrates raw data
transfers, but never directly processes raw data.

.. note::

  DataFed provides a universal storage allocation and fine-grained access control mechanisms to
  enable users at disjoint organizations to share and access data with each other without undue burden on
  local system administrators. Local administrators are able to maintain and enforce data policies
  on local DataFed repositories without disrupting remote DataFed facilities or users in any way.

Continuing with the previous example, the experimental facility shown does not have a local DataFed repository
and, instead, could use allocations on the DataFed repository within the compute facility (if, for example, these
facilities were collaborating or were managed by the same organization). In this scenario, users at the experimental
facility would store and retrieve data using a DataFed allocation granted by the compute facility, but from the users
perspective, all DataFed interactions would behave as if the repository were local. The only noticeable
difference would be increased latency associated with DataFed data transfers.

Many cross-facility and collaborative research scenarios are supported by DataFed, and specific examples are discussed
in the DataFed :doc:`Use Cases </system/usecases>` document.

System Architecture
===================

The DataFed system is composed of a number of system components and interfaces that are deployed across
the DataFed network to implement scalable distributed data storage and indexing. A simplified system architecture
is shown in Figure 2, below, and shows only the central DataFed services, one DataFed data repository, and
supporting interfaces.

..  figure:: /_static/system_components.png
    :scale: 75%
    :align: center

    Figure 2 - DataFed System Components

DataFed's central services include the "Core" service which is essentially the "brains" of DataFed. The core
service manages the metadata associated with managed raw data and also implements access control, orchestration,
and concurrency controls for data movements across the DataFed network. The core service, however, is not directly
involved in the transfer of raw data - this function is delegated to Globus services, or more specifically, to the
GridFTP servers (managed by GLobus) located at DataFed data repositories and other facilities. (The blue lines in
Figure 2 indicate high-performance raw data transfer pathways.)

The raw data storage resources within a DataFed data repository can be any form of physical storage hardware, so long
as the interface to this storage is supported by Globus. Currently this includes POSIX file systems and S3 object
stores. The inherit reliability of the physical storage of a repository is determined by the host facility and
could range from inexpensive magnetic disks to high-speed solid state drives or even archival-quality geographically
distribute storage systems. Local administrators control repository policies and determine which DataFed users can
utilize a repository by granting (or revoking) repository allocations. These local administrative policies and actions
have impact no DataFed on repositories at other facilities.

Figure 2 shows a DataFed repository in isolation; however, a host facility would typically integrate their DataFed
repositories with their own local storage and compute resources. For example, a facility would likely have additional
Globus endpoints that would mount the primary file system(s) of the facility, and they would install high-speed
interconnects between the DataFed repository endpoint and the facility endpoint(s) to increase data transfer speeds
between the two storage systems.

The web services within the DataFed central services primarily support a web portal that allows users to easily organize
and share data from a web browser; however, the web services also play a critical role in authenticating DataFed users
through Globus' federated identity system (which is based on OAuth2). New DataFed users must register through the
DataFed data portal and grant certain permission to DataFed through Globus' authorization system. These permissions
relate to user identification and enabling automatic data transfers on behalf of DataFed users.

----------
Interfaces
----------

Users are able to interact with DataFed through several available interfaces including a graphical web application,
a command-line interface (CLI), and both high- and low-level application programming interfaces (APIs). The easiest
way to interact with DataFed is through the web application (see :doc:`DataFed Web Portal </user/web/portal>`), and
the web application is where users initially register for DataFed accounts.

The DataFed CLI and APIs are all provided through a single Python-based DataFed client packaged available on PyPi. Refer
to the :doc:`Client Installation </user/client/install>`, :doc:`CLI User Guide </user/cli/guide>`, and
:doc:`Python Scripting Guide </user/python/high_level_guide>` for more information.

DataFed's interfaces can be used from any workstation, laptop, or compute node; however, these interfaces only provide
users with the ability to issue commands to the DataFed central service. If users need to be able to also transfer raw
data to or from a given host machine, the local file system of the host machine must be connected to a Globus endpoint.
Typically, research facilities will already provide Globus endpoints to access specific local file systems; however, for
individual workstations and laptops, users will need to install Globus Personal Connect. See `DataFed Client Installation </user/client/install>`
for more information.

User Accounts
=============

------------
Registration
------------

[BRIEF HOW TO USE FOR JOBS, WORKFLOWS, INSTRUMENTS]

System Concepts
===============

DataFed provides a uniform, holistic, and logical view of the data, users, and various organizational structures associated
with the federation of facilities and data storage resources that make up the DataFed network. From a users perspective,
all data operations look and feel the same from within DataFed regardless of where DataFed is being accessed, where data is
physically stored, or which DataFed interface is being utilized. In order to understand the features and capabilities of
DataFed, as a whole, it is necessary to understand the underlying terminology and concepts, and these are discussed in this
section.

---------------
Quick Reference
---------------

Below is a brief, alphabetical list of the most common DataFed and Globus terms and concepts. These topics are discussed in
greater detail in following sections of this document.

- **Access Control** - Access controls are sets of fine-grained permissions associated with data records and/or collections that may be
  applied to specific users or groups of users.

- **Administrator** - A user designated by DOE/ORNL to have full access to DataFed administrative functions.

- **Aliases** - An alias is an optional, human-friendly alternate identifier for data records and collections.

- **Allocation** - An allocation is a storage allowance on a specific DataFed repository. One or more allocations are required
  in order to create DataFed data records.

- **Annotation** - Annotations are a mechanism for opening and tracking issues associated with data records and collections. Depending on
  the severity and outcome of an issue, DataFed may propagate issues to downstream data records for further impact assessment.

- **Attributes** - Attributes are searchable system-defined (fixed) metadata fields associated with certain entities (data records, collections,
  etc.) within DataFed. Textual attributes of data records and collections (ie. title, description) are full-text indexed. The term
  "attributes" is used to avoid confusion with optional user-defined "metadata".

- **Catalog** - The DataFed catalog is a categorized searchable index of internally "published" DataFed collections. All included
  collections and contained data records are readable by any DataFed user. The catalog system is intended for sharing working, rather than static, datasets.

- **Collection** - A collection is a logical (or virtual) folder with a unique identifier and attributes that can be used to
  hierarchically organize, share, and download groups of data records and/or other collections.

- **Creator** - The user that originally creates a Data Record becomes the owner (and creator) of the record and has full irrevocable access to the given record.

- **Data Record** - A data record is the most basic unit of data within DataFed and consists of a unique identifier, attributes,
  and, optionally, raw data and domain-specific metadata.

- **Group** - A group is a user-defined set of users for applying access controls to data records or collections. Groups are not the same as projects.

- **Identifier** - Identifiers are system-unique alphanumeric strings that are automatically assigned to all entities within DataFed.

- **Metadata** - The term "metadata" refers to optional searchable user-defined (domain-specific) structured metadata associated with data
  records. Required top-level metadata is referred to as "attributes" to avoid confusion.

- **Owner** - The user or project that originally creates a Data Record becomes the owner of the record and has full access
  to the given record. Ownership can be transferred to another user or project.

- **Project** - A DataFed project is a logical grouping of users to enable collective ownership of data and to simplify collaboration.
  Projects have their own data storage allocations.

- **Project Administrator** - A user designated by a Project Owner to have managerial access to a specified project.

- **Project Owner** - Any user that creates a DataFed Project is the owner, with full access rights, of the project.

- **Project Member** - A user designated by either a Project Owner or Administrator to have member access to a specified project.

- **Provenance** - Provenance is a form of metadata associated with data records that captures relationships with other data records.
  Provenance is maintained by DataFed using direct links between records rather than identifier references in record attributes or metadata.

- **Repository** - A repository is a federated storage system located at a specific facility that stores the raw data associated with DataFed
  data records. Users and projects may be granted allocations on repositories to enable data storage.

- **Repository Administrator** - A user designated by a DataFed Administrator to have managerial access to a data repository.

- **Root Collection** - The root collection is a reserved collection that acts as the parent for all other (top-level) collections
  and data records. Each user and project has their own root collection.

- **Saved Query** - A saved query is a data search expression that is stored in a query object such that it can be subsequently
  run by referencing the associated query identifier. The results of saved queries are dynamic (i.e. matches from when the query
  is run, rather than when it was saved).

- **Shared Data** - When a user grants permission to access data records and/or collections to other users, those records and collections
  become visible to the referred users as "shared data".

- **Tags** - Tags are searchable, user-defined words that may be associated with data records and collections. Tags use is tallied internally
  to allow popular tags to be identified by users.

- **Task** - Tasks are trackable background processes that run on the DataFed server for specific longer-running operations such as data
  transfers and allocation changes.

- **User** - Any person with a DataFed account. Users are identified by their unique Globus ID account name, with optionally linked organizational accounts.


Globus Concepts:

- **Globus ID** - 
- **Endpoint** - 
- **Endpoint UUID** - 
- **Endpoint Legacy Name** - 
- **Endpoint Activation** - 

[GENERAL STUFF]

-----------------------
Identifiers and Aliases
-----------------------

All records in DataFed (data, collections, user, projects, etc.) are automatically assigned a system-unique identifier
consisting of a prefix and an alphanumeric value. For data records and collections these identifiers are numeric, so
users may choose to assign a more human-friendly "alias" that can be used in place of identifiers. Aliases are alphanumeric
(with certain restrictions) and case sensitive, and, to avoid collisions, are automatically prefixed with the type ("u" or
"p") and value portion of the identifier of the owning user or project, delimited with colons. When aliases are used by the
owner, the alias prefix may be omitted.

For example, if a user with an ID of "u/jsmith" creates an alias "mydata", then the full alias would be "u:jsmith:mydata".
User "jsmith" can simply use "mydata", but other users would need to use the full alias instead. Note that in DataFed web
portal, aliases are typically shown without the prefix.


------------
Data Records
------------

Identifiers
-----------
ID, Alias

Attributes
----------
owner, creator, title, description, tags, ct, ut

Metadata
--------
json, replace / merge

Provenance
----------

Raw Data
--------
repo, source, extension


-----------
Collections
-----------


------------
Sharing Data
------------

--------------------
Collective Ownership
--------------------




When an individual user creates a data record or collection, that user becomes the owner and is granted full control of
the newly created data record or collection. Collective ownership is achieved through the use of *projects*. A DataFed
project is a distinct organizational entity that permits multiple associated users to create and manage data records and
collections as a team - without requiring member users to configure individual access control rules. When a project member
creates a data record or collection, the project becomes the owner of the new record, rather than the creating user;
however, both the project (project owner and administrators) as well as the creating user have administrative rights to the
created record. Other project members have access to project data based on project-wide access control lists managed by the
project owner and administrators.

Projects support specific roles for associated users:

* Project Owner - These users have complete control over the project and contained data and collections. The user that
  initially creates a project becomes an administrator by default, but a project can have multiple administrators assigned.
* Administrators - These users have the ability to add and remove project members (but not administrators or other
  managers), and can also configure access control rules on the projects root collection. A project can have multiple
  managers assigned by administrators.
* Members - These users may create and update data records and collections based on the access control rules set by
  managers or administrators. Always has administrative access to created records.

--------
Metadata
--------

Data records support user-defined metadata. "Metadata" is distinct from built-on record attributes such as title and description,
and is represented using Javascript Object Notation (JSON). JSON was selected because it is human-readable and can represent
arbitrary structured documents. When creating or updating a data record, metadata may be directly specified in textual form, or,
with DataFed CLI, a JSON file may be used as the metadata source. When updating, the user has the option to either replace existing
metadata or to merge new metadata with existing metadata. In the case of merging, any keys that are present both the new and
existing metadata will be overwritten by the new values - other existing keys are left unchanged and new keys are inserted.

Note that when providing metadata, it must fully comply with the JSON specification, located at `<https://tools.ietf.org/html/rfc8259>`_.

Collection Hierarchies
======================

Collection hierarchies within DataFed may resemble a file system with directories containing files and sub-directories.
While similar structurally, there are profound functional differences between DataFed collection hierarchies and typical
file systems:

* In a file system, a file cannot be accessed without *traversing* the directory structure in which it is contained
  (the file's path). The path of the file determines who can access the file through permissions set on
  the individual directories of the path and the file itself. In DataFed, a data record or collection can be accessed
  directly by its unique identifier or alias, and permissions are either inherited from the containing hierarchy, set
  directly on the data record, or both.
* In a file system, a file typically resides in a single directory. Some file systems support linking, which allows file
  contents to be shared by multiple file instances, but the linked files may have different filenames. DataFed allows
  data records (but not collections) to be contained in multiple collection hierarchies. This is achieved by a mechanism
  similar to linking in a file system; except that there is always only one instance of the data record.
* In a file system, there is no way to consistently and unambiguously identify a specific file instance over time. Because
  a file's identity is defined only by it path, if the file is moved, it essentially has a new identity. On the other hand,
  a file could be overwritten by a new file with the same path but entirely different contents - in this case the new file
  has the identity of a previous file, but may be entirely unrelated. DataFed associates a unique, immutable, and non-
  recyclable identifier with data records and collections. No matter which collections it is placed in, or how many times
  it is update, or where the associated raw data is physically stored, a record's identity is always the same.


Access Control
==============

DataFed implements fine-grained access control through a set of permissions that can be applied to both data records and 
collections. Permissions can be configured to apply to anyone, specific users, groups of users, or a combination of any of
these. Data records and collections share the same set of permissions; however, collections have an additional set of
permissions specifically for permission inheritance. The individual permissions are defined as follows:

* VIEW - Allows users to list a data record or collection and view basic information.
* READ_META - Allows users to read any metadata associated with a data record.
* READ_DATA - Allows users to read raw data associated with a data record, or to list the contents of a collection.
* WRITE_META - Allows users to create or update metadata associated with a data record.
* WRITE_DATA - Allows users to create or update raw data associated with a data record, or to add or remove items within a collection.
* ADMIN - Allows users to edit basic information, set access controls, move, and/or delete a data record or collection.

The above permissions may be combined and applied to a data record or collection using one of the following permission scopes:

* User - Permission apply to a specified user.
* Group - Permission apply to a specific group.

Multiple user- and group- scoped permission may be applied. Permissions for a given user are evaluated by combining all
permission set for all scopes that apply - including permissions that may be inherited from parent collection hierarchies.
Because permissions are inherited and additive, the absence of a permission on a given data record or collection is not
equivalent to denying that permission.

Access controls are typically applied to parent collections of a collection hierarchy where contained data and sub-collections
inherit the permissions defined by the top-level parent. Collections have both "local" and "inherited" permissions; where
local permissions control access to the collection record itself, and "inherited" permissions are the permissions passed
down to all contained data records and sub-collections. Note that because data records can be placed into multiple collections,
the inherited permissions of *all* associated parent collections are evaluated for each users accessing a given data record.

Storage Allocations
===================

Having access to DataFed does not, in itself, grant users the ability to create or manage data within DataFed. This is because
DataFed does not provide any raw data storage of its own, but instead relies on *federated* storage provided by DataFed member
organizations. Federated storage is implemented through a network of geographically distributed "data repositories" that are
owned and maintained by specific DataFed member organizations, yet potentially accessible by all DataFed users. It is DataFed
member organizations that individually determine how storage allocations are assigned to specific users.

Typically, DataFed users with an account at one or more DataFed member organizations will be automatically granted storage
allocations on data repositories managed by those organizations. For unaffiliated users, storage allocations may be explicitly
requested from a DataFed member organizations. DataFed member organizations are free to define and enact their own data storage
policies; therefore, users wishing to acquire storage a specific allocation must contact the associated organization for
information on how to proceed. Even though unaffiliated users with no storage allocation cannot use DataFed to create and manage
their own data, DataFed is still allows these users to locate, access, and monitor data owned by other DataFed users or projects.

It is typical for DataFed users to have multiple storage allocations on different data repositories. In this case, a default
storage allocation may be specified, or a specific storage allocation selected when creating new DataFed data records. Data can
be accessed in a consistent manner no matter which data repository it is stored on; however, the physical location of a data
repository in relation to the point of use of data can impact initial access time.

************
Registration
************

User registration is required in order to access DataFed. Registration is free and secure, but requires users to have, or obtain,
a free `Globus <https://www.globus.org>`_ account. Many universities and research facilities, worldwide, are "member organizations"
of Globus and typically provide Globus accounts for their students, staff, and/or users. If your home institute does not provide
Globus accounts, you can obtain a personal Globus account through Globus ID, located `here <https://www.globusid.org>`_.

DataFed registration utilizes a standard Globus authentication and authorization process. When you click the "register" button on
DataFed welcome page, you will be redirected to Globus for authentication (log-in) based on your Globus account. Globus will then
ask you to authorize DataFed to access your Globus identity and to allow DataFed to transfer data on your behalf. Once this process
is complete, you will be redirected to a DataFed post-registration page where you will create a DataFed password. This password is
only used when manually authenticating from DataFed command-line interface, and it can be updated from DataFed Web Portal at any
time.

Note that DataFed will only initiate data transfers when you (or a process running as you) explicitly request it to. Further,
DataFed data transfers are constrained to be between DataFed data storage repositories and Globus endpoints that you have pre-authorized
(or "activated") for access. Globus end-point activation is transient and access will expire within a period determined by the host
institute.

