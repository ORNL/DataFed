from os import path
from datafed import Version_pb2

version="{}.{}.{}:{}".format(Version_pb2.VER_MAJOR,Version_pb2.VER_SERVER,Version_pb2.VER_PROTOCOL,Version_pb2.VER_CLIENT)

# Write contents of the VERSION file
this_directory = path.abspath(path.dirname(__file__))
with open(path.join(this_directory, 'VERSION'), "w+", encoding='utf-8') as f:
    f.write(version)

