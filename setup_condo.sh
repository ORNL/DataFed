#!/bin/bash

module load PE-gnu/3.0
module load boost
module load protobuf
module load cmake

export BOOST_LIB=/software/dev_tools/swtree/cs400_centos7.2_pe2016-08/boost/1.67.0/centos7.2_gnu5.3.0/lib
export BOOST_INC=/software/dev_tools/swtree/cs400_centos7.2_pe2016-08/boost/1.67.0/centos7.2_gnu5.3.0/include
export ZMQ_INC_DIR=/software/dev_tools/swtree/cs400_centos7.5_pe2018/zeromq/4.2.3/centos7.5_gnu8.1.0/include
export ZMQ_LIB_DIR=/software/dev_tools/swtree/cs400_centos7.5_pe2018/zeromq/4.2.3/centos7.5_gnu8.1.0/lib
export PBUF_INC_DIR=/software/dev_tools/swtree/cs400_centos7.5_pe2018/protobuf/3.6.1/centos7.5_gnu8.1.0/include
export PBUF_LIB_DIR=/software/dev_tools/swtree/cs400_centos7.5_pe2018/protobuf/3.6.1/centos7.5_gnu8.1.0/lib
