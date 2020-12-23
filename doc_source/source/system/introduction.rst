============
Introduction
============

DataFed is a *federated* and *scalable* scientific data management and collaboration system that
addresses the critical need for holistic and FAIR-principled "big data" handling within, and across,
scientific domains and facilities - with the goal of enhancing the *productivity* and *reproducibility*
of data-oriented scientific research.

[WHAT IS SDMS, WHY IS IT NEEDED - reproducibility crisis - data management burden - lack of good solution]

DataFed provides a combination of the typical features and benefits of scientific data management systems
(SDMS), laboratory information management systems (LIMS), and data cataloging services. For example,
DataFed provides storage and access to structured and unstructured heterogeneous raw data with access
controls, metadata and provenance capture, and metadata indexing and search; however, DataFed differs
from these other systems in a number of significant ways in order to better serve the needs of open
and collaborative scientific research - especially regarding "big data" and data-oriented research.

Briefly, DataFed provides the following unique blend of capabilities and benefits:

- Presents a uniform and concise logical view of widely distributed data.
- Supports both general- and domain-specific use cases.
- Manages "living data" throughout critical pre-publication data lifecycle stages.
- Encourages FAIR-principled data through user- and community-defined schemas.
- Enhances data awareness via automatic notification of "data events".
- Scales out and up to enable efficient big data research across organizations/facilities.
- Provides high-quality data management foundation for use by other applications and services.



Rationale
=========

There are data management systems that currently exist that help to address some of the data-related
aspects of the reproducibility crisis; however, none of these systems are ideally suited for application
to general scientific research. Laboratory information management systems (LIMS) improve laboratory
efficiency and quality by narrowly focusing on specific domains and data handling processes; however, they
are too rigid and burdensome for general research.

----------------
Existing Systems
----------------

SDMS / LIMS
-----------

SDMS/LIMS PROS:

- Capture and cataloging of data, metadata, and provenance
- Reduction of data handling errors
- Full life cycle
- Enhanced scientific reproducibility 
- Integration with instruments / analytics

SDMS/LIMS CONS:

- No data access outside of organization/VO
- Domain- and process-specific (too rigid for general research)
- Complex, steep learning curve
- Usually don't support Globus
- Single vendor, closed source

Cataloging Systems
------------------

Catalog PROS:

- Capture and cataloging of data and metadata (sometimes provenance)
- Support public data access (HTTP only)
- Easy to access as data consumer
- Easy to stand-up for small data collections
- Open source

Catalog CONS:

- Not FAIR compliant (poor search, no structure/schema, requires a prior knowledge to use)
- Not full-life cycle - static / post-publication data only
- Single organization / VO (for non-public data)
- Usually don't support Globus


----------------
DataFed Benefits
----------------

- DataFed is **general purpose**. DataFed is domain- and methodology-neutral in that it does not require
  users to utilize pre-defined data formats or processes - yet, despite this, DataFed provides powerful
  domain-specific metadata indexing and query capabilities augmented by user/community defined schemas.

- DataFed supports the **pre-publication data lifecycle**.

- DataFed is **Scalable**. Datafed was designed to easily scale-out across multiple/many organizations
  and facilities by relying on federated identity technology and a common access control mechanism;
  however, individual organizations are still able to manage their own data storage resources and policies.
  In contrast, most existing SDMS products either cannot span organizations at all, or rely on virtual
  organization (VO) technologies that are highly labor-intensive to scale beyond a few organizations.

- DataFed **understands big data**. DataFed was design from the start to support "big data" and
  the often complex environments in which such data is created and processed. Many existing SDMS products
  rely on tightly-coupled file systems or HTTP/S for moving data; however, DataFed utilizes Globus (GridFTP)
  for data transfer between facilities because it is the defacto standard for high performance movement
  of very large data sets (Petabyte scale) between government-funded user facilities (DoE), research
  universities, and commercial cloud computing services.

- DataFed focuses on providing high quality, uniform, and easy-to-use data management services
  and does not overreach by bundling complementary features such as instrument control, workflow
  processing, or data analytics that are better served by dedicated application-specific tools. However,
  DataFed does provide application programming interfaces (APIs) to allow other services or applications
  to be utilize DataFed's data management capabilities.


DataFed directly benefits both individual researchers and teams of geographically dispersed collaborators
who need to capture, manage, share, and access scientific data from any of the experimental, observational,
compute, or analytics resources within the Department of Energy's national laboratory network.


.. image:: /_static/simplified_architecture.png

ing, or are local to, multiple user facilities
at Department of Energy national laboratories

(experimental, observational, compute, or analytics),

The key benefits of DataFed for 

discovery, access, and sharing

FAIR

Data Backplane

Scientific Data Life Cycle

Domain Agnostic

Foundation for Domain-Specific Applications

Cross-Facility Research

Database View (logical vs physical)

Metadata and Provenance

Big Data Support
