.. DataFed documentation master file, created by
   sphinx-quickstart on Mon Dec 14 13:53:32 2020.
   You can adapt this file completely to your liking, but it should at least
   contain the root `toctree` directive.

======================================
DataFed - A Scientific Data Federation
======================================

DataFed is a *federated* and *scalable* scientific data management and collaboration system that
addresses the critical need for holistic and FAIR-principled "big data" handling within, and across,
scientific domains and facilities with the goal of enhancing the *productivity* and *reproducibility*
of data-oriented scientific research. DataFed supports the early lifecycle stages of "working"
scientific data and serves as a tool to ease the burden associated with capturing, organizing, and
sharing potentially large volumes of heterogeneous scientific data. DataFed provides an environment
in which scientific data can be precisely controlled and refined in preparation for eventual data
publishing.


DataFed Documentation
=====================

This site contains all user and administrative documentation for the DataFed system - including
client interfaces and application programming interfaces. The system introduction and
overview documents introduce DataFed-specific terminology and key concepts that are references
by subsequent documents on this site.

.. toctree::
   :maxdepth: 2
   :caption: About DataFed

   system/introduction
   system/overview
   system/usecases
   system/papers
   system/getting_started

.. toctree::
   :maxdepth: 2
   :caption: Web Portal

   user/web/portal

.. toctree::
   :maxdepth: 2
   :caption: Client Package

   user/client/install

.. toctree::
   :maxdepth: 2
   :caption: Command Line Interface

   user/cli/guide
   user/cli/reference

.. toctree::
   :maxdepth: 2
   :caption: Python Interface

   user/python/high_level_guide
   user/python/notebooks
   autoapi/index.rst

.. toctree::
   :maxdepth: 2
   :caption: Administration

   admin/install_docker
   admin/install_bare_metal

.. toctree::
   :maxdepth: 2
   :caption: Development

   dev/project
   dev/design
   dev/testing
   dev/release
   dev/roadmap


Indices and tables
==================

* :ref:`genindex`
* :ref:`modindex`
* :ref:`search`
