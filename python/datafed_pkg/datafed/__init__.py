##
# @mainpage DataFed Python Client Package
#
# @section Introduction
#
# This is the source-level documentation for the DataFed Python Client package.
# For DataFed command-line interface (CLI) documentation, please refer to the
# DataFed wiki located on the DataFed project page:
# https://github.com/ORNL/DataFed/wiki
#
# @subsection Package Modules and Use Cases
#
# The DataFed client Python packages consists of the DataFed command-line client
# interface script (datafed), a high-level programming interface module
# (CommandLib), a low-level message-oriented programming module (MessageLib), and
# two support modules (Connection and Config).
#
# The "datafed" CLI, by default, supports human-interactive use, but it is also
# applicable to general scripting by utilizing the optional JSON output mode.
# For Python-specific scripting, the "CommandLib" module can be used to access
# the CLI-style text-based command interface, but with results returned directly
# as Python objects instead of JSON text. If greater control or features are
# needed, Python applications may use the "MessageLib" module to access the low-
# level message-oriented programming interface of DataFed.
#
from . import Version_pb2

name = "datafed"

version = "{}.{}.{}:{}".format(Version_pb2.VER_MAJOR,Version_pb2.VER_MAPI_MAJOR,Version_pb2.VER_MAPI_MINOR,Version_pb2.VER_CLIENT)
