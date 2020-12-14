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
