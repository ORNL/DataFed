from os import path
from datafed import Version_pb2

version = "{}.{}.{}:{}".format(Version_pb2.VER_MAJOR,Version_pb2.VER_MAPI_MAJOR,Version_pb2.VER_MAPI_MINOR,Version_pb2.VER_CLIENT_PY)

# Write contents of the VERSION file
this_directory = path.abspath(path.dirname(__file__))
with open(path.join(this_directory, 'VERSION'), "w+", encoding='utf-8') as f:
    f.write(version)

