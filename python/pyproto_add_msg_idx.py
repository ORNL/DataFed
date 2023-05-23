#!/usr/bin/env python3

"""
Protobuf processing to generate message ID maps for C++, Python, and JS
"""

import sys
import re

print("args", sys.argv)

pf_in = open(sys.argv[1], "r")
pf_out = open(sys.argv[2], "a")

while True:
    line = pf_in.readline()
    if len(line) == 0:
        sys.exit(-1)
    parts = re.split(r"\W+", line.strip())
    # print( line, parts )
    try:
        idx = parts.index("ID")
        # print( "ID:", parts[idx+1] )
        msg_type = int(parts[idx + 1]) << 8
        break
    except:
        pass

# msg_type = 0

by_type = []
idx = 0

pf_out.write("\n_msg_name_to_type = {\n")

while True:
    line = pf_in.readline()
    if len(line) == 0:
        break

    if line.startswith("message "):
        msg_name = line.split()[1]
        by_type.append(msg_name)
        # print( msg_name, msg_type )
        if idx > 0:
            pf_out.write(",\n")
        pf_out.write("    '{}' : {}".format(msg_name, msg_type | idx))
        idx += 1

pf_out.write("\n}\n\n_msg_type_to_name = {\n")

idx = 0
for name in by_type:
    if idx > 0:
        pf_out.write(",\n")
    pf_out.write("    {} : '{}'".format(msg_type | idx, name))
    idx += 1

pf_out.write("\n}\n")

sys.exit(0)
