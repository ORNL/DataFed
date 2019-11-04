## @namespace datafed.CommandLib
# @brief Provides a high-level client interface to the DataFed server
# 
# The DataFed CommandLib module provides a high-level, text-based client
# interface for sending commands to, and receiving replies from, a DateFed
# server. Comands are structured hierarchically, with sub-commands taking
# specific options and arguments.
#
# The CommandLib module is meant to be embedded in a Python script or
# application, and can be used in two ways: 1) interactively via the run()
# function, or 2) programmatically via the exec() function.
#
# For interactive applications, the run() function will prompt the user for
# input, then print a response. Optionally, the run() method can loop until
# the user chooses to exit. The DataFed _cli is a very thin wrapper around
# the CommandLib run() function.
#
# The programmatic interface consists of the init(), login(), and command()
# functions. The command() function executes a single command and returns
# a reply in the form of a Google protobuf message.

from __future__ import division, print_function, absolute_import #, unicode_literals
import os
import sys
import datetime
import re
import json as jsonlib
import time
import pathlib
import wget
from . import SDMS_Auth_pb2 as auth
from . import SDMS_pb2 as sdms
from . import MessageLib
from . import Config
from . import version

if sys.version_info.major == 3:
    unicode = str

class API:
    _max_md_size = 102400
    _max_payload_size = 1048576

    ##
    # @brief Commandlib API constructor
    #
    # The Config class is used to load configuration settings, but settings
    # (all or some) may also be supplied as an argument to the constructor.
    # On success, a secure connection is established to the configured DataFed
    # core server. If user credentials are installed, the associated user
    # will be authenticated; otherwise an anonymous connection will be
    # created. Use the getAuthUser() method to check is authentication is
    # required after constructing an API instance.
    #
    # @param opts - Configuration options (optional)
    # @exception Exception: if invalid config values are present
    #
    def __init__( self, opts = {}, cfg = None, **kwargs ):
        print("CmdLib - init()")

        self._uid = None
        self._cur_sel = None
        self._cur_ep = None
        #self._cur_coll = "root"
        self._cur_alias_prefix = ""
        #self._prev_coll = "root"
        #self._list_items = []

        if cfg == None:
            self._cfg = Config.API( opts )
        else:
            self._cfg = cfg
        _opts = self._setSaneDefaultOptions()
        self._mapi = MessageLib.API( **_opts )
        self._mapi.setNackExceptionEnabled( True )
        auth, uid = self._mapi.getAuthStatus()

        if auth:
            self._uid = uid
            self._cur_sel = uid

    # =========================================================================
    # -------------------------------------------------- Authentication Methods
    # =========================================================================

    ##
    # @brief Get current authenticated user, if any.
    #
    # If current connection is authenticated, returns current user ID; otherwise returns None.
    #
    # @return Authenticated user ID or None if not authenticated
    # @retval (str or None)
    #
    def getAuthUser( self ):
        return self._uid

    ##
    # @brief Logout current client, if any.
    #
    # If connected, logs-out by reseting underlying connection and clearing current user.
    #
    def logout( self ):
        if self._uid:
            self._mapi.reset()
            self._uid = None
            self._cur_sel = None

    ##
    # @brief Manually authenticate client by uid and password
    #
    # If not authenticated, this method attempts manual authentication
    # using the supplied DataFed user ID and password.
    #
    # @param uid - DataFed user ID
    # @param password - DataFed password
    # @exception Exception: if authentication fails.
    #
    def loginByPassword( self, uid, password ):
        self.logout()

        self._mapi.manualAuthByPassword( uid, password )

        self._uid = self._mapi._uid
        self._cur_sel = self._mapi._uid

    ##
    # @brief Manually authenticate client by access token
    #
    # If not authenticated, this method attempts manual authentication
    # using the supplied Globus access token.
    #
    # @param token - Globus access token
    # @exception Exception: if authentication fails.
    #
    def loginByToken( self, token ):
        self.logout()

        self._mapi.manualAuthByToken( token )

        self._uid = self._mapi._uid
        self._cur_sel = self._mapi._uid

    # =========================================================================
    # ------------------------------------------------------------ Data Methods
    # =========================================================================

    def dataView( self, data_id, details = False, context = None ):
        msg = auth.RecordViewRequest()
        msg.id = self._resolve_id( data_id, context )
        msg.details = details

        return self._mapi.sendRecv( msg )

    def dataCreate( self, title, alias = None, description = None, keywords = None, extension = None,
        metadata = None, metadata_file = None, parent_id = "root", deps = None, repo_id = None, context = None ):

        if metadata and metadata_file:
            raise Exception( "Cannot specify both metadata and metadata-file options" )

        msg = auth.RecordCreateRequest()
        msg.title = title
        msg.parent_id = self._resolve_id( parent_id, context )
        #msg.parent_id = self._resolve_coll_id( parent_id, context )

        if alias:
            msg.alias = alias

        if description:
            msg.desc = description

        if keywords:
            msg.keyw = keywords

        if repo_id:
            msg.repo_id = repo_id

        if extension:
            msg.ext = extension
            msg.ext_auto = False
        else:
            msg.ext_auto = True

        # TODO Broken code
        #if metadata_file:
        #    metadata = metadata_file.read()

        if metadata:
            msg.metadata = metadata

        if deps:
            for d in deps:
                dp = msg.deps_add.add()
                if d[0] == "der":
                    dp.type = 0
                elif d[0] == "comp":
                    dp.type = 1
                elif d[0] == "ver":
                    dp.type = 2
                dp.id = self._resolve_id( d[1], context )

        return self._mapi.sendRecv( msg )

    def dataUpdate( self, data_id, title = None, alias = None, description = None, keywords = None,
        extension = None, metadata = None, metadata_file = None, dep_clear = False, dep_add = None,
        dep_rem = None, context = None ):

        if metadata and metadata_file:
            raise Exception( "Cannot specify both metadata and metadata-file options." )

        if dep_clear and dep_rem:
            raise Exception( "Cannot specify both dep-clear and dep-rem options." )

        msg = auth.RecordUpdateRequest()
        msg.id = self._resolve_id( data_id, context )

        if title:
            msg.title = title

        if alias:
            msg.alias = alias

        if description:
            msg.desc = description

        if keywords:
            msg.keyw = keywords

        if extension:
            msg.ext = extension
            msg.ext_auto = False

        # TODO Broken code
        #if metadata_file:
        #    metadata = metadata_file.read()

        if metadata:
            msg.metadata = metadata

        if dep_clear:
            msg.deps_clear = True

        if dep_add:
            for d in dep_add:
                dep = msg.deps_add.add()
                if d[0] == "der":
                    dep.type = 0
                elif d[0] == "comp":
                    dep.type = 1
                elif d[0] == "ver":
                    dep.type = 2
                dep.id = self._resolve_id( d[1], context )

        if dep_rem:
            for d in dep_rem:
                dep = msg.deps_rem.add()
                if d[0] == "der":
                    dep.type = 0
                elif d[0] == "comp":
                    dep.type = 1
                elif d[0] == "ver":
                    dep.type = 2
                dep.id = self._resolve_id( d[1], context )

        return self._mapi.sendRecv( msg )


    def dataDelete( self, data_id, context = None ):
        msg = auth.RecordDeleteRequest()

        if isinstance( data_id, list ):
            for i in data_id:
                msg.id.append( self._resolve_id( i, context ))
        else:
            msg.id.append( self._resolve_id( data_id, context ))

        return self._mapi.sendRecv( msg )


    ##
    # @brief Get (download) raw data for one or more data records and/or collections
    #
    # This method downloads to the specified path the raw data associated with
    # a specified data record, or the records contained in a collection, or
    # with a list of records and/or collections. The download may involve
    # either a Globus transfer, or an HTTP transfer. The path may be a full
    # globus path (only works for Globus transfers), or a full or relative
    # local file system path (will prepend the default endpoint for Globus
    # transfers).
    #
    # @param item_id - Data record or collection ID/alias, or a list of IDs/aliases
    # @param path - Globus or file system destination path
    # @param wait - Wait for get to complete if True
    # @param timeout_sec - Timeout in second for polling Globus transfer status, 0 = no timeout
    # @param display_progress - Enable display of HTTP download progress bar if True
    # @param context - Optional user or project ID to use for alias resolution
    # @exception Exception: if both Globus and HTTP transfers are required
    #
    def dataGet( self, item_id, path, wait = False, timeout_sec = 0, display_progress = False, context = None ):
        # Request server to map specified IDs into a list of specific record IDs.
        # This accounts for download of collections.

        msg = auth.DataGetPreprocRequest()
        for ids in df_id:
            msg.id.append( self._resolve_id( ids, context ))

        reply = self._mapi.sendRecv( msg )

        # May initiate multiple transfers - one per repo with multiple records per transfer
        # Downloads may be Globus OR HTTP, but not both

        glob_list = []
        http_list = []
        for i in reply[0].item:
            if i.url:
                http_list.append((i.url, i.id))
            else:
                glob_list.append(i.id)

        if len(glob_list) > 0 and len(http_list) > 0:
            raise Exception("Cannot 'get' records via Globus and http with same command.")

        if len(http_list) > 0:
            # HTTP transfers
            path = self._resolvePathForHTTP( path )
            reply = auth.HttpXfrDataReply()

            for item in http_list:
                xfr = reply.xfr.add()
                xfr.rec_id = item[1]
                xfr.mode = sdms.XM_GET
                setattr( xfr, "from", item[0] )
                xfr.to = path
                xfr.started = int(time.time())

                try:
                    filename = os.path.join( path, wget.filename_from_url( item[0] ))
                    # wget has a buggy filename uniquifier, appended integer will not increase after 1
                    new_filename = self._uniquifyFilename( filename )

                    if display_progress:
                        data_file = wget.download( item[0], out=str(new_filename), bar=_bar_adaptive_human_readable)
                        #_print_msg(1,"\nRecord {} downloaded to {}".format( item[1], data_file ))
                    else:
                        data_file = wget.download( item[0], out=str(new_filename), bar=None)
                        xfr.to = data_file
                        xfr.updated = int(time.time())
                        xfr.status = sdms.XS_SUCCEEDED
                except Exception as e:
                    xfr.status = sdms.XS_FAILED
                    xfr.err_msg = str(e)
                    xfr.updated = int(time.time())

                return [ reply, "HttpXfrDataReply" ]
        elif len(glob_list) > 0:
            # Globus transfers
            msg = auth.DataGetRequest()
            msg.id.extend(glob_list)
            msg.path = self._resolvePathForGlobus( path, False )

            reply = self._mapi.sendRecv( msg )

            if wait:
                xfr_ids = []
                replies = []
                num_xfr = len( reply[0].xfr )
                elapsed = 0

                for xfrs in reply[0].xfr:
                    xfr_ids.append(( xfrs.id, True ))

                msg = auth.XfrViewRequest()

                while wait and num_xfr > 0:
                    time.sleep( 2 )
                    elapsed = elapsed + 2

                    for xid in xfr_ids:
                        if xid[1]:
                            msg.xfr_id = xid[0]

                            reply = self._mapi.sendRecv( msg, nack_except = False )

                            # Not sure this can happen:
                            if reply[1] == "NackReply":
                                num_xfr = num_xfr - 1
                                xid[1] = False

                            check = reply[0].xfr[0]
                            if check.status >= 3:
                                replies.append( check )
                                num_xfr = num_xfr - 1
                                xid[1] = False

                    if timeout_sec and elapsed > timeout_sec:
                        break

                # This is messy... there is no single transfer status reply available from the server after the initial request
                # Must create a new reply and insert the contents of the status replies from the polling loop
                reply = auth.XfrDataReply()
                reply.xfr.extend( replies )
                return [reply,"XfrDataReply"]
            else:
                return reply
        else:
            # Will land here if tried to get a collection with no records
            raise Exception("No data records found to download")


    def dataPut( self, data_id, path, wait = False, timeout_sec = 0, extension = None, context = None ):
        msg = auth.DataPutRequest()
        msg.id = self._resolve_id( data_id, context )
        msg.path = path
        if extension:
            msg.ext = extension

        reply = self._mapi.sendRecv( msg )

        if wait:
            #TODO Eventually replace polling with server push
            msg2 = auth.XfrViewRequest()
            msg2.xfr_id = reply[0].xfr[0].id
            elapsed = 0

            while True:
                time.sleep(2)
                elapsed = elapsed + 2

                reply2 = self._mapi.sendRecv( msg2, nack_except = False )

                # Not sure if this can happen:
                if reply2[1] == "NackReply":
                    break

                reply = reply2
                check = reply[0].xfr[0]

                if check.status == 3 or check.status == 4:
                    break

                if timeout_sec and elapsed > timeout_sec:
                    break

        return reply


    def dataBatchCreate( self, file, coll_id = None, context = None ):
        payload = []
        tot_size = 0

        for f in file:
            fp = pathlib.Path(f)

            if not fp.is_file():
                raise Exception( "File not found: " + f )

            tot_size += fp.stat().st_size
            if tot_size > _max_payload_size:
                raise Exception( "Total batch create size exceeds limit ({})".format( _max_payload_size ))

            with fp.open('r+') as f:
                records = jsonlib.load(f)

                if not isinstance(records, list):
                    records = [records]

                if coll_id:
                    coll = self._resolve_id( coll_id, context )
                    for item in records:
                        item["parent"] = coll

                payload.extend( records )

        msg = auth.RecordCreateBatchRequest()
        msg.records = jsonlib.dumps( payload )

        return self._mapi.sendRecv( msg )


    def dataBatchUpdate( self, file ):
        payload = []
        tot_size = 0

        for f in file:
            fp = pathlib.Path(f)

            if not fp.is_file():
                raise Exception( "File not found: " + f )

            tot_size += fp.stat().st_size
            if tot_size > _max_payload_size:
                raise Exception( "Total batch update size exceeds limit ({})".format( _max_payload_size ))

            with fp.open('r+') as f:
                records = jsonlib.load(f)

                if not isinstance( records, list ):
                    payload.append( records )
                else:
                    payload.extend( records )

        msg = auth.RecordUpdateBatchRequest()
        msg.records = jsonlib.dumps( payload )

        return self._mapi.sendRecv( msg )

    # =========================================================================
    # ------------------------------------------------------ Collection Methods
    # =========================================================================

    def collectionView( self, coll_id, context = None ):
        msg = auth.CollViewRequest()
        msg.id = self._resolve_id( coll_id, context )
        #msg.id = self._resolve_coll_id( coll_id, context )

        return self._mapi.sendRecv( msg )


    def collectionCreate( self, title, alias = None, description = None, topic = None, parent_id = None, context = None ):
        msg = auth.CollCreateRequest()
        msg.title = title

        if alias:
            msg.alias = alias

        if description:
            msg.desc = description

        if topic:
            msg.topic = topic

        if parent_id:
            msg.parent_id = self._resolve_id( parent_id, context )
            #msg.parent_id = self._resolve_coll_id( parent_id, context )

        return self._mapi.sendRecv( msg )


    def collectionUpdate( self, coll_id, title = None, alias = None, description = None, topic = None, context = None ):
        msg = auth.CollUpdateRequest()
        msg.id = self._resolve_id( coll_id, context )
        #msg.id = self._resolve_coll_id( coll_id, context )

        if title:
            msg.title = title

        if alias:
            msg.alias = alias

        if description:
            msg.desc = description

        if topic:
            msg.topic = topic

        if topic:
            msg.topic = topic

        return self._mapi.sendRecv( msg )


    def collectiondelete( self, coll_id, context = None ):
        msg = auth.CollDeleteRequest()

        if isinstance( coll_id, list ):
            for i in coll_id:
                msg.id.append( self._resolve_id( i, context ))
        else:
            msg.id.append( self._resolve_id( coll_id, context ))

        return self._mapi.sendRecv( msg )


    ##
    # @brief List items in collection
    #
    # If not authenticated, this method attempts manual authentication
    # using the supplied Globus access token.
    #
    # @param coll_id - Collection ID or alias
    # @exception Exception: if authentication fails.
    #
    def collectionItemsList( self, coll_id, offset = 0, count = 20, context = None ):
        msg = auth.CollReadRequest()
        msg.count = count
        msg.offset = offset
        msg.id = self._resolve_id( coll_id, context )
        #msg.id = self._resolve_coll_id( coll_id, context )

        return self._mapi.sendRecv( msg )


    def collectionItemsUpdate( self, coll_id, add_ids = None, rem_ids = None, context = None ):
        msg = auth.CollWriteRequest()
        msg.id = self._resolve_id( coll_id, context )
        #msg.id = self._resolve_coll_id( coll_id, context )

        if isinstance( add_ids, list ):
            for i in add_ids:
                msg.add.append( self._resolve_id( i, context ))
        elif isinstance( add_ids, str ):
            msg.add.append( self._resolve_id( add_ids, context ))

        if isinstance( rem_ids, list ):
            for i in rem_ids:
                msg.rem.append( self._resolve_id( i, context ))
        elif isinstance( rem_ids, str ):
            msg.rem.append( self._resolve_id( rem_ids, context ))

        return self._mapi.sendRecv( msg )


    def collectionGetParents( self, coll_id, context = None ):
        msg = auth.CollGetParentsRequest()
        msg.id = self._resolve_id( coll_id, context )
        #msg.id = self._resolve_coll_id( coll_id, context )
        msg.inclusive = False

        return self._mapi.sendRecv( msg )

    # =========================================================================
    # ----------------------------------------------------------- Query Methods
    # =========================================================================

    def queryList( self, offset = 0, count = 20 ):
        msg = auth.QueryListRequest()
        msg.offset = offset
        msg.count = count

        return self._mapi.sendRecv( msg )


    def queryExec( self, query_id ):
        msg = auth.QueryExecRequest()
        msg.id = query_id

        return self._mapi.sendRecv( msg )


    # =========================================================================
    # ------------------------------------------------------------ User Methods
    # =========================================================================

    def userListCollaborators( self, offset = 0, count = 20 ):
        msg = auth.UserListCollabRequest()
        msg.offset = offset
        msg.count = count

        return self._mapi.sendRecv( msg )


    def userListAll( self, offset = 0, count = 20 ):
        msg = auth.UserListAllRequest()
        msg.offset = offset
        msg.count = count

        return self._mapi.sendRecv( msg )


    def userView( self, uid ):
        msg = auth.UserViewRequest()
        msg.uid = self._resolve_index_id( uid )

        return self._mapi.sendRecv( msg )


    # =========================================================================
    # --------------------------------------------------------- Project Methods
    # =========================================================================

    def projectList( self, owned = True, admin = True, member = True, offset = 0, count = 20 ):
        msg = auth.ProjectListRequest()
        msg.as_owner = owned
        msg.as_admin = admin
        msg.as_member = member
        msg.offset = offset
        msg.count = count

        return self._mapi.sendRecv( msg )


    def projectView( self, project_id ):
        msg = auth.ProjectViewRequest()
        msg.id = project_id

        return self._mapi.sendRecv( msg )


    # =========================================================================
    # ----------------------------------------------------- Shared Data Methods
    # =========================================================================


    def sharedUsersList( self ):
        msg = auth.ACLByUserRequest()

        return self._mapi.sendRecv( msg )


    def sharedProjectsList( self ):
        msg = auth.ACLByProjRequest()

        return self._mapi.sendRecv( msg )


    def sharedDataList( self, owner_id ):
        oid = owner_id.lower()

        if oid.startswith("p/"):
            msg = auth.ACLByProjListRequest()
        else:
            msg = auth.ACLByUserListRequest()
            if not oid.startswith("u/"):
                oid = "u/" + oid

        msg.owner = oid

        return self._mapi.sendRecv( msg )


    # =========================================================================
    # --------------------------------------------------- Data Transfer Methods
    # =========================================================================

    def xfrList( self, time_from = None, to = None, since = None, status = None, limit = 20 ):
        if since != None and (time_from != None or to != None):
            raise Exception("Cannot specify 'since' and 'from'/'to' ranges.")

        msg = auth.XfrListRequest()

        if time_from != None:
            ts = self.strToTimestamp( time_from )
            if ts == None:
                raise Exception("Invalid time format for 'from' option.")

            setattr( msg, "from", ts )

        if to != None:
            ts = self.strToTimestamp( to )
            if ts == None:
                raise Exception("Invalid time format for 'to' option.")

            msg.to = ts

        if since != None:
            try:
                suf = since[-1]
                mod = 1

                if suf == 'h':
                    val = int(since[:-1])
                    mod = 3600
                elif suf == 'd':
                    val = int(since[:-1])
                    mod = 24*3600
                elif suf == 'w':
                    val = int(since[:-1])
                    mod = 7*24*3600
                else:
                    val = int(since)

                if val == None:
                    raise Exception("Invalid value for 'since'")

                msg.since = val*mod
            except:
                raise Exception("Invalid value for 'since'")

        if status != None:
            stat = status.lower()
            if stat in ["0","1","2","3","4"]:
                msg.status = int(stat)
            elif stat == "init" or stat == "initiated":
                msg.status = 0
            elif stat == "active":
                msg.status = 1
            elif stat == "inactive":
                msg.status = 2
            elif stat == "succeeded":
                msg.status = 3
            elif stat == "failed":
                msg.status = 4

        if limit != None:
            try:
                lim = int(limit)
            except:
                raise Exception("Invalid limit value.")

            if lim > 0:
                msg.limit = lim
            else:
                raise Exception("Invalid limit value.")

        return self._mapi.sendRecv( msg )


    def _xfr_stat( self, xfr_id = None ):
        if xfr_id:
            msg = auth.XfrViewRequest()
            msg.xfr_id = xfr_id

            reply = self._mapi.sendRecv( msg )
        else:
            msg = auth.XfrListRequest()
            msg.limit = 1

            reply = self._mapi.sendRecv( msg )

        return reply

    # =========================================================================
    # -------------------------------------------------------- Endpoint Methods
    # =========================================================================

    def endpointListRecent( self ):
        msg = auth.UserGetRecentEPRequest()

        return self._mapi.sendRecv( msg )

    def endpointDefaultGet( self ):
        return self._cfg.get( "default_ep" )

    def endpointDefaultSet( self, endpoint ):
        # TODO validate ep is UUID or legacy (not an ID)
        self._cfg.set( "default_ep", endpoint, True )

    def endpointGet( self ):
        return self._cur_ep

    def endpointSet( self, endpoint ):
        # TODO validate ep is UUID or legacy (not an ID)
        self._cur_ep = endpoint


    # =========================================================================
    # --------------------------------------------------- Miscellaneous Methods
    # =========================================================================

    def setupCredentials( self ):
        cfg_dir = self._cfg.get("client_cfg_dir")
        pub_file = self._cfg.get("client_pub_key_file")
        priv_file = self._cfg.get("client_priv_key_file")

        if cfg_dir == None and (pub_file == None or priv_file == None):
            raise Exception("Client configuration directory and/or client key files not configured")

        msg = auth.GenerateCredentialsRequest()

        reply = self._mapi.sendRecv( msg )

        if pub_file == None:
            pub_file = os.path.join(cfg_dir, "datafed-user-key.pub")

        keyf = open( pub_file, "w" )
        keyf.write( reply[0].pub_key )
        keyf.close()

        if priv_file == None:
            priv_file = os.path.join(cfg_dir, "datafed-user-key.priv")

        keyf = open( priv_file, "w" )
        keyf.write( reply[0].priv_key )
        keyf.close()


    '''
    def getWorkingCollection( self ):
        return self._cur_coll


    def setWorkingCollection( self, coll_id, context = None ):
        msg = auth.CollViewRequest()
        msg.id = self._resolve_coll_id( coll_id, context )

        reply = self._mapi.sendRecv( msg )

        self._prev_coll = self._cur_coll
        self._cur_coll = msg.id
    '''

    def setContext( self, item_id = None ):
        if item_id == None:
            if self._cur_sel == self._uid:
                return

            self._cur_sel = self._uid
            #self._cur_coll = "c/u_" + self._uid[2:] + "_root"
            self._cur_alias_prefix = ""
        else:
            #id2 = self._resolve_index_val( item_id )
            id2 = item_id

            if id2[0:2] == "p/":
                msg = auth.ProjectViewRequest()
                msg.id = id2
            else:
                if id2[0:2] != "u/":
                    if id2.find("/") > 0 or id2.find(":") > 0:
                        raise Exception("setContext invalid ID, '" + id2 + "'. Must be a user or a project ID")
                    id2 = "u/" + id2

                msg = auth.UserViewRequest()
                msg.uid = id2

            reply = self._mapi.sendRecv( msg )

            self._cur_sel = id2

            if id2[0] == "u":
                #self._cur_coll = "c/u_" + self._cur_sel[2:] + "_root"
                self._cur_alias_prefix = "u:" + self._cur_sel[2:] + ":"
            else:
                #self._cur_coll = "c/p_" + self._cur_sel[2:] + "_root"
                self._cur_alias_prefix = "p:" + self._cur_sel[2:] + ":"


    def getContext( self ):
        return self._cur_sel

    '''
    def getWorkingPath( self ):
        msg = auth.CollGetParentsRequest()
        msg.id = self._cur_coll
        msg.inclusive = True

        return self._mapi.sendRecv( msg )
    '''

    def timestampToStr( self, ts ):
        return time.strftime("%m/%d/%Y,%H:%M", time.localtime( ts ))


    def strToTimestamp( self, time_str ):
        try:
            return int( time_str )
        except:
            pass

        try:
            return int( datetime.datetime.strptime( time_str, "%m/%d/%Y" ).timestamp())
        except:
            pass

        try:
            return int( datetime.datetime.strptime( time_str, "%m/%d/%Y,%H:%M" ).timestamp())
        except:
            pass

        try:
            return int( datetime.datetime.strptime( time_str, "%m/%d/%Y,%H:%M:%S" ).timestamp())
        except:
            pass

        return None

    # =========================================================================
    # --------------------------------------------------------- Private Methods
    # =========================================================================

    def _uniquifyFilename( self, path ):
        filepath = pathlib.Path(path)
        while filepath.exists():
            stem = filepath.stem #string
            suffixes = filepath.suffixes #list
            stem_parts = stem.split("__", 1) #list

            if stem_parts[-1].isdigit(): #nth copy
                index_value = int(stem_parts[-1])
                index_value += 1
                stem_parts[-1] = str(index_value)
                new_stem = "__".join(stem_parts)
                new_name = [new_stem]
                for suffix in suffixes: new_name.append(suffix)
                new_name = "".join(new_name)
                filepath = filepath.with_name(new_name)
            else: #first copy
                new_stem = stem + "__1"
                new_name = [new_stem]
                for suffix in suffixes: new_name.append(suffix)
                new_name = "".join(new_name)
                filepath = filepath.with_name(new_name)

        return str(filepath)

    def _resolvePathForHTTP( self, path ):
        if path[0] == "~":
            res = pathlib.Path(path).expanduser().resolve()
        elif path[0] == "." or path[0] != '/':
            res = pathlib.Path.cwd() / path
            res = res.resolve()
        else:
            res = path

        return str(res)

    def _resolvePathForGlobus( self, path, must_exist ):
        # path arg is a string

        if path[0] == "~":
            path = pathlib.Path(path).expanduser()
        elif path[0] == ".":
            path = pathlib.Path.cwd() / path
        else:
            path = pathlib.Path(path)

        if must_exist:
            path = path.resolve()
        else:
            # Can't use resolve b/c it throws an exception when a path doesn't exist pre python 3.6
            # Must manually locate the lowest relative path component and resolve only to that point
            # Then append then remainder to the resolved portion

            idx = 0
            rel = None
            for p in path.parts:
                if p == "." or p == "..":
                    rel = idx
                idx = idx + 1

            if rel != None:
                basep = pathlib.Path()
                endp = pathlib.Path()
                idx = 0
                for p in path.parts:
                    if idx <= rel:
                        basep = basep.joinpath( p )
                    else:
                        endp = endp.joinpath( p )
                    idx = idx + 1

                path = basep.resolve().joinpath(endp)

        endpoint_name = re.compile(r'[\w\-]+#[\w\-]+')
        endpoint_uuid = re.compile(r'[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}', re.I)

        if re.match(endpoint_name, str(path)) or re.match(endpoint_uuid, str(path)): #starts with endpoint
            fp = path
        else:
            fp = pathlib.PurePath(path)

            if isinstance(fp, pathlib.PureWindowsPath):
                if fp.drive:
                    drive_name = fp.drive.replace(':', '')
                    parts = fp.parts[1:]
                    fp = pathlib.PurePosixPath('/' + drive_name)
                    for item in parts:
                        fp = fp / str(item)  # adds each part
                elif not fp.drive:
                    fp = fp.as_posix()
                    if fp[0] != '/':
                        fp = "/" + fp

            if self._cur_ep:
                fp = self._cur_ep + str(fp)
            else:
                raise Exception("No endpoint set")

        return str(fp)



    def _resolve_id( self, item_id, context = None ):
        #id2 = self._resolve_index_val( item_id )

        if ( len( item_id ) > 2 and item_id[1] == "/" ) or ( item_id.find(":") > 0 ):
            return item_id

        if context:
            return context[0] + ":" + context[2:] + ":" + item_id
        else:
            return self._cur_alias_prefix + item_id

    '''
    def _resolve_coll_id( self, coll_id, context = None ):
        if coll_id == ".":
            return self._cur_coll
        elif coll_id == "-":
            return self._prev_coll
        elif coll_id == "/":
            if context:
                return "c/" + context[0] + "_" + context[2:] + "_root"
            else:
                return "c/" + self._cur_sel[0] + "_" + self._cur_sel[2:] + "_root"
        elif coll_id == "..":
            # TODO This should be GetParent no GetParents
            msg = auth.CollGetParentsRequest()
            msg.id = self._cur_coll

            reply = self._mapi.sendRecv( msg )

            if len(reply[0].path) and len(reply[0].path[0].item):
                return reply[0].path[0].item[0].id
            else:
                raise Exception("Already at root")
        else:
            return self._resolve_id( coll_id, context )

    def _resolve_index_val( self, item_id ):
        try:
            if len( item_id ) <= 3:

                if item_id.endswith("."):
                    idx = int(item_id[:-1])
                else:
                    idx = int(item_id)

                if idx <= len( self._list_items ):
                    return self._list_items[idx-1]

        except ValueError:
            pass

        return item_id
    '''


    def _setSaneDefaultOptions( self ):
        opts = self._cfg.getOpts()

        # Examine initial configuration options and set & save defaults where needed
        save = False

        if not "server_host" in opts:
            self._cfg.set( "server_host", "datafed.ornl.gov" )
            opts["server_host"] = "datafed.ornl.gov"
            save = True

        if not "server_port" in opts:
            self._cfg.set( "server_port", 7512 )
            opts["server_port"] = 7512
            save = True

        if not "server_pub_key_file" in opts:
            serv_key_file = None

            if "server_cfg_dir" in opts:
                serv_key_file = os.path.expanduser( os.path.join( opts['server_cfg_dir'], "datafed-core-key.pub" ))
                self._cfg.set( "server_pub_key_file", serv_key_file )
                opts["server_pub_key_file"] = serv_key_file

            if not serv_key_file or not os.path.exists( serv_key_file ):
                serv_key_file = None
                if "client_cfg_dir" in opts:
                    serv_key_file = os.path.expanduser( os.path.join( opts['client_cfg_dir'], "datafed-core-key.pub" ))
                    self._cfg.set( "server_pub_key_file", serv_key_file )
                    opts["server_pub_key_file"] = serv_key_file
                    save = True

                if not serv_key_file:
                    raise Exception("Could not find location of server public key file.")

                if not os.path.exists(serv_key_file):
                    # Make default server pub key file
                    url = "https://"+opts["server_host"]+"/datafed-core-key.pub"
                    fname = wget.download( url, out=serv_key_file )

        if not "client_pub_key_file" in opts or not "client_priv_key_file" in opts:
            if not "client_cfg_dir" in opts:
                raise Exception("Client key file(s) or client configuration directory not specified or invalid.")

            if not "client_pub_key_file" in opts:
                key_file = os.path.expanduser( os.path.join( opts['client_cfg_dir'], "datafed-user-key.pub" ))
                self._cfg.set( "client_pub_key_file", key_file )
                opts["client_pub_key_file"] = key_file
                save = True

            if not "client_priv_key_file" in opts:
                key_file = os.path.expanduser( os.path.join( opts['client_cfg_dir'], "datafed-user-key.priv" ))
                self._cfg.set( "client_priv_key_file", key_file )
                opts["client_priv_key_file"] = key_file
                save = True

        if save:
            self._cfg.save()

        return opts

