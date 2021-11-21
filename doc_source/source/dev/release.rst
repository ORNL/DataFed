=============
Release Notes
=============

1.2.0-4, May 28, 2021
=====================

The DataFed 1.2.0-4 release is a minor release consisting of many bug fixes and two significant
new features: metadata schema support and external raw data references. This update impacted
all components of DataFed including the Web Portal and the Python client/API package. The updated
DataFed Python package is available from PyPi at `<https://pypi.org/project/datafed/>`_. Although
the Python client/API was changed, existing DataFed scripts should continue to function normally
after the DataFed Python package is updated to version 1.2.0-4.

------------
New Features
------------

- External Raw Data References: This feature allows DataFed records to be created with references to
  unmanaged raw data hosted by an external Globus endpoint. When creating a record (from either the
  web portal or the CLI/API), an "external data" option is provided that will cause DataFed to treat
  the associated raw data source as a stable external reference. Data records created with this option
  can be used normally, with the exception that data cannot be uploaded to these records. Also, when
  downloading external raw data, the user must ensure that both the destination endpoint and the
  endpoint storing the raw data are activated.

- Metadata Schemas: This feature adds the ability for users to define and apply metadata schemas to
  data records and to utilize metadata schemas for advanced searches across collections of data
  and collections. Metadata schemas follow a modified form of the JSON Schema Specification, at
  `<https://json-schema.org/>`_. If the metadata of a record does not conform the associated
  schema, the record is flagged as non-compliant and errors may be viewed in the records metadata tab
  in the Web Portal. The CLI/API also provides an option to reject records with non-compliant metadata.

----------------------------
Impacts to Existing Features
----------------------------

- The "Search" tab in the footer area of the Web Portal has been removed and replaced by a toggleable
  search side-bar with more search options (similar to the search side-bar for the catalog). The
  visibility of the search side-bar can be toggled using the magnifying glass icon in the toolbar of
  the data browser (aka "My Data").

- The implementation of data/collection search was dramatically overhauled for more capabilities and
  better performance; however, it is not longer possible to search over multiple scopes at once (i.e.
  multiple projects, or data shared from multiple users). This catalog search implementation was not
  changed significantly.

- Existing "Saved Queries" will no longer work and must be deleted and re-created. This is due to
  a fundamental change in how data/collections queries are structured and executed.

--------------------------
Enhancements and Bug Fixes
--------------------------

- #760 Core - Client UID is being set wrong from CLI/Python API
- #759 Need to simplify search scope/owner parameters
- #758 CLI - Project view command lists admins twice
- #757 CLI - Add documentation to 'ls' and 'wc' commands for path options
- #756 CLI - Query run command incomplete/out-dated
- #755 CLI - Query create incomplete/out-of-date
- #754 CLI - Query Update command incomplete/out-dated
- #753 CLI - Query view does not work
- #752 Updating saved query does not replace selection
- #751 CLI - Add dependent doesn't work
- #749 ACLs are being mishandled when record ownership is changed
- #745 Project listing does not page
- #744 Reset page offset when search parameters are changed
- #742 AQL array functions not recognized by query parser
- #741 Catalog is missing owner search field
- #739 CLI - Data view and create/update replies do not display schema ID or metadata errors
- #738 CLI - Invalid reference to "external"
- #737 Database fails on POST without body
- #736 Web - Metadata search reset does not clear schema
- #735 Web - Search panel selection background missing in light theme
- #733 Download encryption available check doesn't work for external data
- #731 Web - Remove border from annotation list
- #730 When metadata error is present, info panel notes tab is always enabled
- #729 Closing parent annotation cause multiple issues on derived record
- #727 Web - Select category dialog fails to load topics
- #726 Web - Annotating record with meta error hides error icon
- #725 Web - Using query builder does not trigger query
- #723 Query builder error highlight color too dark on light theme
- #722 Catalog metadata fields not working
- #721 Core - negative regular expression in query causes AQL exception
- #720 Web - Query builder generates invalid expressions
- #713 Closed annotation bit mask conflicts with metadata error bit
- #712 Web - Upload did not start after records create with raw data source
- #711 Download of external data always uses original name
- #709 DataFed is reporting transfer complete before it actually is complete
- #708 Globus checksum failure not being caught and reported by DataFed
- #707 Deleting collection always deletes records with external data
- #700 Schema revision shows usage references
- #698 Web - Rework search or tree selection, drag & drop for search mode
- #696 Schema ref count out of sync
- #695 Support saving searches with schema support
- #694 Web - Dragging search result to folder cause an invalid page load
- #693 Web - Enter in tag input should trigger search
- #691 Core - Empty and un-tracked files were created but not deleted
- #690 Web - Folder page does not reset on close/reopen
- #687 Data transfer allowed encryption to be set to required, but one endpoint did not support it
- #683 DB - Remove need for location edges on data records with external raw data
- #681 Web - Paging does not work in catalog view
- #680 Web - Paging breaks for published collections
- #677 Web - Collection selected when expanded in search mode
- #675 Web - Defer catalog view load until tab activated
- #674 Add creator field to Collections
- #673 Add creator to data search
- #672 Data search returns duplicate results
- #671 Multiple allocations created for same project
- #670 Data search of project data bypasses access controls
- #668 Move all non-trivial messages from anon to auth
- #667 Short aliases are not recognized
- #666 Schema: Get rid of separate schema version
- #664 Schema: metadata errors are not cleared under all conditions
- #660 Schema: Add metadata validation error search option
- #659 Schema: Add option to CLI to fail data create/update with metadata validation errors
- #657 Schema: Dependencies of an in-use schema shall not be editable or deletable
- #656 Schema: Support external schema references to local definitions
- #652 Schema: Support metadata schemas
- #647 Web - Need scroll bars on user list in repo admin dialog
- #643 System - Record dependency updates are not checked by any permission
- #605 Data Refs: Allow linking to external raw data via URI/path
- #602 DB - Reduce task logging
- #596 Search: Improve Data Search Interface
- #570 Schema: Support multiple types in JSON Schema
- #569 Schema: Need to handle "$defs" in schema validation/query-builder
- #564 Schema: Need to support arrays in schema validation
- #563 Schema: Add schema circular reference detection in validation
- #220 System - Collection aliases in search scopes are not resolved
- #33 Schema: User definition and management of metadata schemas

------------
Known Issues
------------

- The metadata validator uses strict JSON parsing rules and does not accept floating point numbers
  with an absolute value between 0 and 1 without a leading zero (i.e. requires 0.25 instead of .25)

- When editing save queries, the original search selection is not loaded/displayed and must be re-
  entered before updating the query.

- The graphical query editor does not currently support parsing metadata expressions typed into the
  metadata search field and will show a blank query when opened.

- If a saved query contains a specific collection to search, and that collection is later deleted, the
  saved query will report an error message when run.

- Drag and drop is support for collections in the data browser; however, projects, users, and the
  personal data catagories cannot be dragged to the selection input.

- Paging of query results and changing sort options for saved queries is not yet supported.

- Schema management functions are not available from the CLI.

