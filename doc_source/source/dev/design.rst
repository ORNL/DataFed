=====================
Architecture & Design
=====================

DataFed is built around a hub-and-spoke architecture. In this design, the
centralized metadata services act as the hub, while DataFed-managed repositories
function as the spokes that connect into the system. This architecture supports
flexible growth, distributed storage, and robust metadata management.

Central Services (Hub)
======================

The core of DataFed consists of three primary services: the database layer,
the C++ core service, and the web server.

Database Layer (ArangoDB)
-------------------------

At the center of the architecture is the metadata database, powered by
**ArangoDB**. ArangoDB is a multimodel database that supports key–value,
document-store, and graph data models. This combination makes it especially
well-suited for metadata-driven systems:

- The **graph model** enables rich representation of provenance relationships,
  dataset linkages, and hierarchical structures.
- The **document store** and **key–value** capabilities support nested metadata
  documents, allowing flexible schemas and expressive, domain-specific queries.
- The multimodel nature of ArangoDB allows DataFed to unify structured,
  semi-structured, and relational metadata within a single backend.

C++ Core Service
----------------

The C++ core service forms the primary interface between the database and all
other components of the system. It is the only service with direct access to
the database. Its responsibilities include:

- **Message relay and coordination:** It brokers communication between external
  systems—such as repository services, Python clients, and the web server.
- **Task management:** It manages long-running background operations, including
  Globus data transfers and other asynchronous workflows.
- **Schema validation:** It executes JSON Schema validation to ensure that all
  metadata ingested into the system conforms to the expected structure.

Web Server
----------

The web server provides browser-based access to DataFed. It exposes the user
interface and API endpoints and can be deployed behind NGINX or any other
reverse proxy for additional security, load balancing, or TLS termination.

Repository Services (Spokes)
============================

The spokes in the hub-and-spoke model are the DataFed repositories that provide
the actual data storage capabilities. Currently, these repositories rely on the
**Globus** platform.

A typical repository consists of:

- **Globus Connect Server (GCS):**  
  A customized GCS deployment that incorporates a DataFed authorization (authz)
  callout module. This module integrates with the GridFTP server and routes all
  access-control decisions back to the C++ core service, ensuring centralized
  authorization.

- **DataFed Repository Service:**  
  A companion service that runs alongside the Globus Connect Server. It handles
  additional repository-specific responsibilities, including data preparation,
  repository state management, and supporting repository workflows.

Together, the central services and distributed repositories form a cohesive,
scalable system for managing scientific metadata and data movement across
institutions and storage environments.

