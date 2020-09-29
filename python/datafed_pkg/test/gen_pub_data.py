#!/usr/bin/env python3

import random
import datafed.CommandLib

print("DataFed data gen test script")

api = datafed.CommandLib.API()

def selectRand( a, b, cnt ):
    res = []
    N = random.randint(a,b)
    for i in range(N):
        retry = True
        while retry:
            j = random.randint( 0, cnt-1 )
            retry = False
            for k in res:
                if k == j:
                    retry = True
                    break
        res.append( j )

    return res

root_coll = "root"
par_coll = "pub-coll"
keywords = ["synthetic","organic","regenerative","photosynthesis","culture","society","distributed","centralized","advanced","distopian"]
tags = ["apple","orange","red","blue","night","day","future","past","good","bad"]
topics = [
    "energy.generation.fission",
    "energy.generation.fusion",
    "energy.generation.solar",
    "energy.generation.wind",
    "energy.generation.hydroelectric",
    "energy.generation.geothermal",
    "energy.generation.coal",
    "energy.storage.battery",
    "energy.storage.flywheel",
    "energy.storage.gravity",
    "energy.transmission.ac",
    "energy.transmission.dc",
    "energy.transmission.rf"
]

try:
    api.collectionView( par_coll )
except Exception:
    api.collectionCreate( par_coll, par_coll, parent_id = root_coll )


for i in range(500):
    name = "Published Collection {}".format(i)
    alias = "pub-coll-{}".format(i)

    sel = selectRand(1, 3, len( keywords ))
    _desc = "A collection about"
    for j in sel:
        _desc += " " + keywords[j]

    sel = selectRand(1, 3, len( tags ))
    _tags = []
    for j in sel:
        _tags.append( tags[j] )

    sel = random.randint(0,len(topics)-1)
    _topic = topics[sel]

    api.collectionCreate( name, alias = alias, parent_id = par_coll, description = _desc, tags = _tags, topic = _topic )

    for j in range(20):
        name = "Demo Data {}.{}".format(i,j)

        sel = selectRand(1, 3, len( keywords ))
        _desc = "A data record about"
        for k in sel:
            _desc += " " + keywords[k]

        sel = selectRand(1, 3, len( tags ))
        _tags = []
        for k in sel:
            _tags.append( tags[k] )

        api.dataCreate( name, metadata = "{{\"x\":{},\"y\":{}}}".format(i,j), parent_id = alias, description = _desc, tags = _tags )


print("done")
