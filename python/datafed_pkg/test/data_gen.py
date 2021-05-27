#!/usr/bin/env python3

#api.dataPut(name,"esnet#cern-diskpt1/data1/1M.dat")

import sys
import argparse
import random
import datafed.CommandLib
import json
import time
import getpass

parser = argparse.ArgumentParser( description='DataFed Data Generator' )

parser.add_argument('start', type=int,
                    help='Collection start index')

parser.add_argument('end', type=int,
                    help='Collection end index (included)')

parser.add_argument('--ctx', metavar='ID',
                   help='Parent / user ID for context (aliases)')

parser.add_argument('-p', metavar='COLL', default='test',
                   help='Parent collection id/alias')

parser.add_argument('-A', metavar='PREFIX', default='test',
                   help='Alias prefix (i.e. PREFIX.coll.N, PREFIX.data.N.M)')

parser.add_argument('-T', metavar='PREFIX', default='Test',
                   help='Title prefix (i.e. PREFIX Colletion N, PREFIX Data N.M)')

parser.add_argument('-c', metavar='COUNT', type=int, default=20,
                   help='Number of data records per collection')

parser.add_argument('--up', metavar='FILE',
                   help='Upload filename from dev server /data/files')

parser.add_argument('--alloc', metavar='NAME',
                   help='Destination allocation (without repo/ prefix)')

parser.add_argument('--public', action='store_true',
                   help='Generate public collections with random topics')

parser.add_argument('--delete', action='store_true',
                   help='Delete collections (public flag will un-publish first)')

parser.add_argument('-m', action='store_true',
                   help='Manually authenticate')

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

ctx = args.ctx
par_coll = args.p
alias_pfx = args.A
title_pfx = args.T
rec_cnt = args.c
pub = args.public
do_del = args.delete
up_file = args.up


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

aliases = []
ref_ty = ["der","ver","comp"]
adjectives = ["synthetic","organic","regenerative","distributed","centralized","advanced","dystopian"]
subjects = ["photosynthesis","culture","society","technology","computing","transportation","power generation","process optimization"]
tags = ["apple","orange","banana","red","blue","green","night","day","future","past","present","good","bad","up","down","left","right"]
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


opts = {}

if args.m:
    opts['manual_auth'] = True
    uid = input("User ID: ")
    password = getpass.getpass(prompt="Password: ")

api = datafed.CommandLib.API( opts )

if args.m:
    api.loginByPassword( uid, password )
    print( api.getAuthUser() )

try:
    api.collectionView( par_coll, context = ctx )
except Exception:
    api.collectionCreate( par_coll, par_coll, context = ctx )


_topic = None

tstart = time.time()

for i in range( start, end + 1 ):
    alias = "{}.coll.{}".format(alias_pfx,i)

    print( alias )

    if do_del:
        if pub:
            if api.collectionUpdate( alias, topic = "", context = ctx )[0] == None:
                print("Timeout on collectionUpdate, coll {}".format(i))
                exit()
        
        if api.collectionDelete( alias, context = ctx )[0] == None:
            print("Timeout on collectionDelete, coll {}".format(i))
            exit()

        continue

    name = "{} Collection {}".format(title_pfx,i)

    sel = selectRand(1, 2, len( adjectives ))
    _desc = "A collection of data regarding"
    for j in sel:
        _desc += " " + adjectives[j]

    sel = selectRand(1, 1, len( subjects ))
    _desc += " " + subjects[sel[0]] + "."

    sel = selectRand(1, 3, len( tags ))
    _tags = []
    for j in sel:
        _tags.append( tags[j] )


    #print("c",i)

    if api.collectionCreate( name, alias = alias, parent_id = par_coll, description = _desc, tags = _tags, context = ctx )[0] == None:
        print("Timeout on collectionCreate, coll {}".format(i))
        exit()

    for j in range( rec_cnt ):
        #print("d",i,j)

        name = "{} Data {}.{}".format(title_pfx,i,j)
        data_alias = "{}.data.{}.{}".format(alias_pfx,i,j)
        aliases.append(data_alias)

        # Description
        sel = selectRand(1, 3, len( adjectives ))
        _desc = "A data record about"
        for k in sel:
            _desc += " " + adjectives[k]

        sel = selectRand(1, 1, len( subjects ))
        _desc += " " + subjects[sel[0]] + "."

        # Tags
        sel = selectRand(1, 3, len( tags ))
        _tags = []
        for k in sel:
            _tags.append( tags[k] )

        # Generate metadata (alternate schemas?)
        md = {
            "i" : i,
            "j" : j,
            "tag": tags[selectRand(1, 1, len( tags ))[0]],
            "keyword": subjects[selectRand(1, 1, len( subjects ))[0]]
        }

        # 75% chance to have x and y
        if random.uniform(0,1) > .75:
            md['x'] = random.randint(-100,100)
            md['y'] = random.randint(-100,100)

        # 50% chance to have p and q
        if random.uniform(0,1) > .75:
            md['p'] = random.uniform(-1,1)
            md['q'] = random.uniform(-1,1)

        md['data'] = []
        dlen = random.randint(1,10)
        for k in range( dlen ):
            md['data'].append( random.randint( 0, 9 ))

        # Provenance - random links to previous records, 50% none,
        deps = []
        num_link = random.randint(0,5) - 2

        if num_link > 0 and num_link < len(aliases)-1:
            links = selectRand( 0, num_link, len(aliases)-1 )

            for l in links:
                deps.append( ["der",aliases[l]] )

        # Create record
        if api.dataCreate( name, alias=data_alias, metadata = json.dumps(md), parent_id = alias, description = _desc,
            tags = _tags, schema = "datagen:0", deps = deps, repo_id = repo, context = ctx )[0] == None:
            print("Timeout on dataCreate, coll {}, rec {}".format(i,j))
            exit()

        if up_file:
            if api.dataPut( data_alias, "u_eiiq2lgi7fd7jfaggqdmnijiya#SDMS-Dev/data/files/" + up_file, context = ctx )[0] == None:
                print("Timeout on dataPut, coll {}, rec {}".format(i,j))
                exit()

    if pub:
        sel = random.randint(0,len(topics)-1)
        _topic = topics[sel]

    if api.collectionUpdate( alias, topic = _topic, context = ctx )[0] == None:
        print("Timeout on collectionUpdate, coll {}".format(i))
        exit()

tend = time.time()

print("done in {} sec".format( tend - tstart ))
