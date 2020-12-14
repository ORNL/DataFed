===============
System Overview
===============

DataFed is a federated data collaboration and management system for science. DataFed provides
many features that ease the data management burden associated with general scientific research;
however, the primary goal of DataFed is to improve scientific data quality by enabling precise
full-life-cycle control over data artifacts, with the ability to uniformly share and access data
across geographically distributed facilities. The combined capabilities of DataFed directly support
the concept of "repeatable science" by unambiguously identifying data, capturing context and
metadata, and by providing the means to access and utilize data globally.

DataFed can be thought of as a "Tier 2+" distributed data storage system - meaning it is intended
for creating and working with data that is of medium- to long-term significance to the owner and/or
collaborators. Unlike a Tier 1 storage system (i.e. a local file system), DataFed compromises raw
access performance in favor of FAIR data principles. While DataFed shares many features with Tier 3
storage systems (i.e. data archives), DataFed allows data and metadata to be updated and specifically
includes features for disseminating any changes to downstream dependents (via provenance) and/or data
subscribers. DataFed also provides additional collaboration features to enable precise "in-band"
communication regarding data and collections of data (as opposed to ad hoc methods such as email).

DataFed utilizes `Globus <https://www.globus.org>`_ for efficient and secure data transfers, as well as
for user authentication. Globus can be thought of as a "data network" where data transfers take place
between Globus "endpoints" - which are Globus services that enable access to underlying file systems
hosted by member organizations. DataFed adds a data management layer on top of Globus that permits data
to be located and accessed without needing to know where the data is physically stored within the Globus
network. Because DataFed relies heavily on Globus, it is recommended that DataFed users familiarize
themselves with how Globus works from their online documentation at `<https://www.globus.org/what-we-do>`_.

DataFed is an open source project hosted on GitHub at `<https://github.com/ORNL/DataFed>`_. DataFed is
under active development at Oak Ridge National Laboratory (ORNL) within the Oak Ridge Leadership
Computing Facility (OLCF) and is currently deployed in an alpha-release state for early access users.

************
Key Concepts
************

DataFed aggregates and abstracts the federation of distributed data, storage systems, facilities, users, groups,
and projects into a single logical unit - with a common nomenclature and uniform access patterns. Some of the
components of DataFed represent real physical systems; whereas others are purely abstract. These components are
defined as follows:

* Data Record - A single unit of data with associated unique identity, attributes, metadata, and raw data.
* Collection - An organizational unit with a unique identity and attributes that aggregates data records and/or subordinate collections.
* Root Collection - A special collection associated with all users and projects that serves as a default parent container.
* User - A person that is identified by a unique Globus account, with optionally linked facility accounts.
* Group - A set of users with a unique identity and attributes used for project membership and access control purposes.
* Project - An abstract unit with a unique identity and attributes composed of one or more member users and providing collective ownership of data.
* Access Control - A set of inheritable permissions associated with a data record or collection that applies to specific users and/or groups, or, optionally, to users that are not explicitly specified.
* Facility - A physical location that houses one or more data storage systems or compute resources that is federated into DataFed network.
* Data Repository - A logical unit with associated unique identity and attributes that represents a federated storage system located at a given facility.
* Storage Allocation - A logical relationship between a user or project and a data repository specifying an allowed storage capacity.

A key idea of DataFed is the presentation of data in an location-agnostic manner. From a logical viewpoint,
users do not need to know where data is physically stored within DataFed - data can be accessed from any supported
facility, or the web portal, by using assigned data record identifiers or user-defined aliases. From a performance
standpoint, the physical storage location of data likely matters depending on where the data is being accessed from.
For this reason, DataFed will support data repository caching to optimize frequently accessed data. In addition, users
with allocations on multiple data repositories may opt to migrate data between repositories based on usage locality.

Identifiers and Aliases
=======================

All records in DataFed (data, collections, user, projects, etc.) are automatically assigned a system-unique identifier
consisting of a prefix and an alphanumeric value. For data records and collections these identifiers are numeric, so
users may choose to assign a more human-friendly "alias" that can be used in place of identifiers. Aliases are alphanumeric
(with certain restrictions) and case sensitive, and, to avoid collisions, are automatically prefixed with the type ("u" or
"p") and value portion of the identifier of the owning user or project, delimited with colons. When aliases are used by the
owner, the alias prefix may be omitted.

For example, if a user with an ID of "u/jsmith" creates an alias "mydata", then the full alias would be "u:jsmith:mydata".
User "jsmith" can simply use "mydata", but other users would need to use the full alias instead. Note that in DataFed web
portal, aliases are typically shown without the prefix.

Collective Ownership
====================

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

Metadata
========

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
ollections. Permissions can be configured to apply to anyone, specific users, groups of users, or a combination of any of
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

