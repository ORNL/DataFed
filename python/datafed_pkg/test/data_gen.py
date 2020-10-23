#!/usr/bin/env python3

#api.dataPut(name,"esnet#cern-diskpt1/data1/1M.dat")

import sys
import argparse
import random
import datafed.CommandLib
import json
import time

parser = argparse.ArgumentParser( description='DataFed Data Generator' )

parser.add_argument('start', type=int,
                    help='Collection start index')

parser.add_argument('end', type=int,
                    help='Collection end index (included)')

parser.add_argument('-p', metavar='COLL', default='test',
                   help='Parent collection id/alias')

parser.add_argument('-A', metavar='PREFIX', default='test',
                   help='Alias prefix (i.e. PREFIX.coll.N, PREFIX.data.N.M)')

parser.add_argument('-T', metavar='PREFIX', default='Test',
                   help='Title prefix (i.e. PREFIX Colletion N, PREFIX Data N.M)')

parser.add_argument('-c', metavar='COUNT', type=int, default=20,
                   help='Number of data records per collection')

parser.add_argument('-u', action='store_true',
                   help='Upload small test file for each data record')

parser.add_argument('--alloc', metavar='NAME',
                   help='Destination allocation (without repo/ prefix)')

parser.add_argument('--public', action='store_true',
                   help='Generate public collections with random topics')

parser.add_argument('--delete', action='store_true',
                   help='Delete collections (public flag will un-publish first)')

args = parser.parse_args()

#print(args)

start = args.start
end = args.end

if start < 0 or end < start:
    print("Invalid start/end indexes")
    exit()

if args.c < 0:
    print("Invalid data record count")
    exit()

if args.alloc:
    repo = "repo/" + args.alloc
else:
    repo = None

par_coll = args.p
alias_pfx = args.A
title_pfx = args.T
rec_cnt = args.c
pub = args.public
do_del = args.delete
do_up = args.u

#exit()

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



keywords = ["synthetic","organic","regenerative","photosynthesis","culture","society","distributed","centralized","advanced","distopian"]
tags = ["apple","orange","red","blue","night","day","future","past","good","bad","up","down","left","right"]
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
    "engineering.computer",
    "engineering.software",
    "engineering.mechanical",
    "engineering.electrical",
    "computing.cloud",
    "computing.hpc",
    "computing.quantum",
    "computing.virtual"
]

api = datafed.CommandLib.API()

try:
    api.collectionView( par_coll )
except Exception:
    api.collectionCreate( par_coll, par_coll, parent_id = "root" )


_topic = None

tstart = time.time()

for i in range( start, end + 1 ):
    alias = "{}.coll.{}".format(alias_pfx,i)

    if do_del:
        if pub:
            if api.collectionUpdate( alias, topic = "" )[0] == None:
                print("Timeout on collectionUpdate, coll {}".format(i))
                exit()
        
        if api.collectionDelete( alias )[0] == None:
            print("Timeout on collectionDelete, coll {}".format(i))
            exit()

        continue;

    name = "{} Collection {}".format(title_pfx,i)

    sel = selectRand(1, 3, len( keywords ))
    _desc = "A collection about"
    for j in sel:
        _desc += " " + keywords[j]

    sel = selectRand(1, 3, len( tags ))
    _tags = []
    for j in sel:
        _tags.append( tags[j] )


    #print("c",i)

    if api.collectionCreate( name, alias = alias, parent_id = par_coll, description = _desc, tags = _tags )[0] == None:
        print("Timeout on collectionCreate, coll {}".format(i))
        exit()

    for j in range( rec_cnt ):
        #print("d",i,j)

        name = "{} Data {}.{}".format(title_pfx,i,j)
        data_alias = "{}.data.{}.{}".format(alias_pfx,i,j)

        sel = selectRand(1, 3, len( keywords ))
        _desc = "A data record about"
        for k in sel:
            _desc += " " + keywords[k]

        sel = selectRand(1, 3, len( tags ))
        _tags = []
        for k in sel:
            _tags.append( tags[k] )

        md = {
            "i" : i,
            "j" : j,
            "x": random.randint(-100,100),
            "y": random.randint(-100,100),
            "a": random.randint(0,3599)/10.0,
            "v": random.randint(0,100),
            "tag": tags[selectRand(1, 1, len( tags ))[0]],
            "keyword": keywords[selectRand(1, 1, len( keywords ))[0]]
        }

        if api.dataCreate( name, alias=data_alias, metadata = json.dumps(md), parent_id = alias, description = _desc, tags = _tags, repo_id = repo )[0] == None:
            print("Timeout on dataCreate, coll {}, rec {}".format(i,j))
            exit()

        if do_up:
            if api.dataPut( data_alias, "u_eiiq2lgi7fd7jfaggqdmnijiya#SDMS-Dev/data/files/small" )[0] == None:
                print("Timeout on dataPut, coll {}, rec {}".format(i,j))
                exit()

    if pub:
        sel = random.randint(0,len(topics)-1)
        _topic = topics[sel]

    if api.collectionUpdate( alias, topic = _topic )[0] == None:
        print("Timeout on collectionUpdate, coll {}".format(i))
        exit()

tend = time.time()

print("done in {} sec".format( tend - tstart ))
