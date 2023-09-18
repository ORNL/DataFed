================
Feature Road Map
================

Planned Features
================

- Metadata Schema Support (#33)
- Full Documentation (#594)

New User Features
=================

- Improved Data Search Interface (#596)
- Provenance-Based Relational Data Search (#597)
- Data Events, Notifications, & Subscriptions (#401)
- Multimedia Attachments for Data Records (#12)
- HTTPS Data Transfer (#571)
- Organization and Project Directory (#35)
    - add orgs/facilities, affiliated users & projects
    - contacts and repo admin requests
    - sci network geo map of orgs/facilities
- Provide REST API as alternative to Python API (#595)
- Full-Featured Python HL-API (#598)
- Full-Featured CLI (#599)
- System Administration Interfaces (#600)

Production-Related Changes
==========================

- Database Scaling / Resilience
    - cluster configuration with replication
    - mirror record metadata files on repositories
    - automatic DB back-ups
- Core Service Scaling / Resilience
    - switch comms from ZeroMQ to TCP/TLS
    - add core service load balancer
    - update task management to operate non-exclusively
    - support dynamic repositories (add/remove)
- Web Service Scaling / Resilience
    - web server farm w/ load balancer
- Repository Service Updates
    - object stores
    - policy enforcement
- Update to Globus Connect Ver. 5
    - impacts repository endpoint configuration & authentication
    - required for HTTP data access
- Rebuild Current Web Portal Using a Modern Web Framework

Potential Features / Changes
============================

- Data Communities / Groups
    - like google groups, share data with members, notifications
- Integration with Data Publishing Systems
    - users can easily publish from DataFed
    - data can be retained in datafed, or linked
    - datafed APIs can be used to get published data
    - data events would work on published data
- Client Data Ingest Tools
    - metadata extraction
    - tar/zip directories
    - batch import directories
    - synchronize managed directories
- Revisit Peer-to-Peer Data Indexing Architecture
    - currently requires central index
    - can be robust, but still single point of failure (think google)
    - remote searches would be very slow
    - mirroring peer data would require very large synchronized indexes
