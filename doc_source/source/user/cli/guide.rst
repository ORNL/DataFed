==========
User Guide
==========

.. include:: header.rst

This document covers basic and advanced usage of the DataFed CLI with examples. Before the DataFed
CLI can be used it must be installed and properly configured - refer to the CLI :doc:`/user/cli/install`
page for details.

Basic Usage
===========

The DataFed CLI is run using the 'datafed' script installed by the DataFed CLI package, as follows::

    datafed [options] [command [sub-command ...]]

For a list of options, the built-in help output can be viewed::

    datafed --help

The DataFed CLI supports three distinct modes of use: single command, interactive shell, and script
mode. If the CLI is run without any command arguments, an interactive shell is started; otherwise,
the specified command is run either normally (human-friendly output) or in script mode if the
'--script' option is specified.

**Single Command**

This mode is used to run a single DafaFed command given as an argument to the datafed script. The
output is in human-friendly format.

**Interactive Shell**

This mode provides a DataFed CLI shell and is started by running the datafed script without any
command arguments. Commands are entered at the prompt (without the 'datafed' script prefix) and
the shell will run until stopped with the 'exit' command, or by typing 'Ctrl-C'. Shell mode is
stateful and convenient for browsing DataFed collection hierarchies.

**Script Mode**

This mode is similar to the single command mode with the exception that non-essential output is
suppressed and command responses are returned in a strict JSON format. This mode is useful for
integrating the CLI into non-Python scripts (i.e. bash), and is activated by specifying the
"--script" (or "-s") command line option when the CLI is run. 

.. note::

    For a complete guide to DataFed scripting, please refer to the :doc:`/user/scripting` page.
    The :doc:`/user/api/python` page provides a detailed reference to the DataFed API for
    scripting and custom application development.


Usage Guide
===========

.. attention::

    Section not written. Will discuss use of shell-specific features (ls, cd, switching user, etc).

Topics to be covered:

- Command abbreviations and aliases
- Basics of the interactive shell
- Navigating collections
- Accessing project and shared data and collections
- Data transfers (asynch, monitoring)
