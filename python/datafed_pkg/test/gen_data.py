#!/usr/bin/env python3

import datafed.CommandLib

print("DataFed data gen test script")

api = datafed.CommandLib.API()

root_coll = "root"
par_coll = "demo"

try:
    api.collectionView( par_coll )
except Exception:
    api.collectionCreate( par_coll, par_coll, parent_id = root_coll )

api.dataCreate( "Experiment 1", 
    alias = "exp-1",
    description = "Demo context record for SNS experiment on beam line 1.",
    tags = ["demo","sns","bl1","experiment"],
    metadata = "{\"facility\":\"sns\",\"beamline\":\"1\"}",
    parent_id = par_coll )

api.dataCreate( "Calibration 1", 
    alias = "exp-1-cal-1",
    description = "Calibration for experiment 1.",
    tags = ["demo","sns","bl1","calibration","vanadium"],
    metadata = "{\"sample\":{\"material\":\"vanadium\",\"id\":\"CAL-V-1234\"},\"run\":{\"number\":1,\"duration\":60}}",
    deps = [["comp","exp-1"]],
    parent_id = par_coll )

api.dataPut("exp-1-cal-1","esnet#cern-diskpt1/data1/1M.dat")

api.dataCreate( "Calibration 2", 
    alias = "exp-1-cal-2",
    description = "Calibration for experiment 1.",
    tags = ["demo","sns","bl1","calibration","vanadium"],
    metadata = "{\"sample\":{\"material\":\"vanadium\",\"id\":\"CAL-V-1234\"},\"run\":{\"number\":2,\"duration\":360}}",
    deps = [["comp","exp-1"],["ver","exp-1-cal-1"]],
    parent_id = par_coll )

api.dataPut("exp-1-cal-2","esnet#cern-diskpt1/data1/1M.dat")

api.dataCreate( "Run 1", 
    alias = "exp-1-run-1",
    description = "Run 1 of experiment 1.",
    tags = ["demo","sns","bl1","run","iron"],
    metadata = "{\"sample\":{\"material\":\"iron\",\"id\":\"Fe-1234\"},\"run\":{\"number\":1,\"duration\":360}}",
    deps = [["comp","exp-1"],["der","exp-1-cal-1"]],
    parent_id = par_coll )

api.dataPut("exp-1-run-1","esnet#cern-diskpt1/data1/1M.dat")

api.dataCreate( "Run 2", 
    alias = "exp-1-run-2",
    description = "Run 2 of experiment 1.",
    tags = ["demo","sns","bl1","run","iron"],
    metadata = "{\"sample\":{\"material\":\"iron\",\"id\":\"Fe-1234\"},\"run\":{\"number\":2,\"duration\":600}}",
    deps = [["comp","exp-1"],["der","exp-1-cal-2"]],
    parent_id = par_coll )

api.dataPut("exp-1-run-2","esnet#cern-diskpt1/data1/1M.dat")

api.dataCreate( "Run 3", 
    alias = "exp-1-run-3",
    description = "Run 3 of experiment 1.",
    tags = ["demo","sns","bl1","run","iron"],
    metadata = "{\"sample\":{\"material\":\"iron\",\"id\":\"Fe-1234\"},\"run\":{\"number\":3,\"duration\":300}}",
    deps = [["comp","exp-1"],["der","exp-1-cal-2"]],
    parent_id = par_coll )

api.dataPut("exp-1-run-3","esnet#cern-diskpt1/data1/1M.dat")

api.dataCreate( "Analysis 1", 
    alias = "exp-1-analysis-1",
    description = "Analysis 1 of experiment 1.",
    tags = ["demo","sns","bl1","analysis","iron"],
    metadata = "{\"paramters\":{\"x\":1,\"y\":2}}",
    deps = [["der","exp-1-run-1"]],
    parent_id = par_coll )

api.dataCreate( "Analysis 2", 
    alias = "exp-1-analysis-2",
    description = "Analysis 2 of experiment 1. (Calibration 1 was bad.)",
    tags = ["demo","sns","bl1","analysis","iron"],
    metadata = "{\"paramters\":{\"x\":1,\"y\":2}}",
    deps = [["der","exp-1-run-2"],["der","exp-1-run-3"]],
    parent_id = par_coll )

print("done")
