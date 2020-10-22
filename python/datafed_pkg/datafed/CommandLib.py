## @package datafed.CommandLib
# Provides a high-level client interface to the DataFed server
# 
# The DataFed CommandLib module contains a single API class that provides
# a high-level client interface for interacting with a DataFed server. This
# module relies on the DataFed MessageLib and Connection modules  for lower-
# level communication support.

from __future__ import division, print_function, absolute_import
import os
import sys
import datetime
import re
import json as jsonlib
import time
import pathlib
import wget
from . import SDMS_Anon_pb2 as anon
from . import SDMS_Auth_pb2 as auth
from . import SDMS_pb2 as sdms
from . import MessageLib
from . import Config
from . import version


##
# @class API
# @brief Provides a high-level messaging interface to the DataFed core server.
#
# The DataFed CommandLib.API class provides a high-level interface
# for sending requests to a DataFed server. Requests are sent via regular
# class methods and replies are returned as Google protobuf message objects.
# These reply messages are defined in the \*.proto files included in the
# DataFed client package. Basic functionality of th API class mirrors the 
# capabilities exposed in the DataFed CLI.
#
class API:
    _max_md_size = 102400
    _max_payload_size = 1048576
    _endpoint_legacy = re.compile(r'[\w\-]+#[\w\-]+')
    _endpoint_uuid = re.compile( r'[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}', re.I )

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
    def __init__( self, opts = {} ):
        #print("CommandLib Init")

        if not isinstance( opts, dict ):
            raise Exception( "CommandLib API options parameter must be a dictionary." )

        self._uid = None
        self._cur_sel = None
        self._cur_ep = None
        self._cur_alias_prefix = ""

        self.cfg = Config.API( opts )
        _opts = self._setSaneDefaultOptions()

        self._mapi = MessageLib.API( **_opts )
        self._mapi.setNackExceptionEnabled( True )
        auth, uid = self._mapi.getAuthStatus()

        if auth:
            self._uid = uid
            self._cur_sel = uid

        self._cur_ep = self.cfg.get( "default_ep" )

    # =========================================================================
    # -------------------------------------------------- Authentication Methods
    # =========================================================================

    ##
    # @brief Get current authenticated user, if any.
    #
    # If current connection is authenticated, returns current user ID; otherwise returns None.
    #
    # @return Authenticated user ID or None if not authenticated
    #
    def getAuthUser( self ):
        return self._uid

    ##
    # @brief Logout current client, if any.
    #
    # If connected, logs-out by reseting underlying connection and clearing current user.
    #
    # @return None
    #
    def logout( self ):
        if self._uid:
            self._mapi.logout()
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
    # @return None
    #
    def loginByPassword( self, uid, password ):
        self.logout()

        self._mapi.manualAuthByPassword( uid, password )

        self._uid = self._mapi._uid
        self._cur_sel = self._mapi._uid

    ##
    # @brief Generate/download local user credentials
    #
    # Requests the DataFed server to generate and send local credentials for
    # the current user. These credentials should be saved/loaded from a
    # set of public/private client keys files as specified via the Config
    # module.
    #
    # @exception Exception: On communication or server error
    # @return A ???? Google protobuf message object
    #
    def generateCredentials( self ):
        msg = auth.GenerateCredentialsRequest()

        return self._mapi.sendRecv( msg )


    # =========================================================================
    # ------------------------------------------------------------ Data Methods
    # =========================================================================

    ##
    # @brief View a data record
    #
    # Retrieves full data record with metadata (without raw data).
    #
    # @param data_id - Data record ID or alias
    # @param details - NOT USED
    # @param context - User or project ID to use for alias resolution (optional)
    # @return A RecordDataReply Google protobuf message object
    # @exception Exception: On communication or server error
    #
    def dataView( self, data_id, details = False, context = None ):
        msg = anon.RecordViewRequest()
        msg.id = self._resolve_id( data_id, context )
        msg.details = details

        return self._mapi.sendRecv( msg )

    ##
    # @brief Create a new data record
    #
    # Create a new data record. May specify alias, containing collection,
    # metadata, dependencies, and allocation. Raw data must be uploaded
    # separately. Cannot use both metadata and metadata_file options.
    #
    # @param title - Title of record (required)
    # @param alias - Alias of record (optional)
    # @param description - Text description (optional)
    # @param tags - Array of tags (optional)
    # @param extension - Raw data file extension override (optional)
    # @param metadata - Domain-specific metadata (JSON object, optional)
    # @param metadata_file - Path to local file containing domain-specific metadata (JSON object, optional)
    # @param parent_id - ID/alias of containing collection (root is default)
    # @param deps - Dependencies (array of tuples of relation type and record ID)
    # @param repo_id - Repository ID (use default of owner if not specified)
    # @param context - User or project ID to use for alias resolution (optional)
    # @return A RecordDataReply Google protobuf message object
    # @exception Exception: On invalid options or communication/server error
    #
    def dataCreate( self, title, alias = None, description = None, tags = None, extension = None,
        metadata = None, metadata_file = None, parent_id = "root", deps = None, repo_id = None, context = None ):

        if metadata and metadata_file:
            raise Exception( "Cannot specify both metadata and metadata-file options" )

        msg = auth.RecordCreateRequest()
        msg.title = title
        msg.parent_id = self._resolve_id( parent_id, context )

        if alias:
            msg.alias = alias

        if description:
            msg.desc = description

        if tags:
            msg.tags.extend( tags )

        if repo_id:
            msg.repo_id = repo_id

        if extension:
            msg.ext = extension
            msg.ext_auto = False

        if metadata_file:
            try:
                f = open( metadata_file, "r" )
                metadata = f.read()
                f.close()
            except:
                raise Exception("Could not open metadata file: {}".format( metadata_file ))

        if metadata:
            msg.metadata = metadata

        if deps:
            for d in deps:
                dp = msg.deps.add()
                if d[0] == "der":
                    dp.type = 0
                elif d[0] == "comp":
                    dp.type = 1
                elif d[0] == "ver":
                    dp.type = 2
                dp.id = self._resolve_id( d[1], context )

        return self._mapi.sendRecv( msg )

    ##
    # @brief Update an existing data record
    #
    # Update an existing data record. May specify title, alias, metadata,
    # dependencies, and allocation. Raw data must be uploaded separately.
    # Cannot use both metadata and metadata_file options.
    #
    # @param data_id - Record ID/alias (required)
    # @param title - Title of record (optional)
    # @param alias - Alias of record (optional)
    # @param description - Text description (optional)
    # @param tags - Array of tags (optional)
    # @param extension - Raw data file extension override (optional)
    # @param metadata - Domain-specific metadata (JSON object, optional)
    # @param metadata_file - Path to local file containing domain-specific metadata (JSON object, optional)
    # @param metadata_set - Set (replace) existing metadata with provided (default is merge)
    # @param deps - Set all dependencies (array of tuples of relation type and record ID)
    # @param deps_add - Dependencies to add (array of tuples of relation type and record ID)
    # @param deps_rem - Dependencies to remove (array of tuples of relation type and record ID)
    # @param context - User or project ID to use for alias resolution (optional)
    # @return A RecordDataReply Google protobuf message object
    # @exception Exception: On invalid options or communication/server error
    #
    def dataUpdate( self, data_id, title = None, alias = None, description = None, tags = None,
        extension = None, metadata = None, metadata_file = None, metadata_set = False, deps_add = None,
        deps_rem = None, context = None ):

        if metadata and metadata_file:
            raise Exception( "Cannot specify both metadata and metadata-file options." )

        msg = auth.RecordUpdateRequest()
        msg.id = self._resolve_id( data_id, context )

        if title is not None:
            msg.title = title

        if alias is not None:
            msg.alias = alias

        if description is not None:
            msg.desc = description

        if tags is not None:
            if not tags:
                msg.tags_clear = True
            else:
                msg.tags.extend( tags )

        if extension is not None:
            if extension:
                msg.ext = extension
                msg.ext_auto = False
            else:
                msg.ext_auto = True

        if metadata_file:
            try:
                f = open( metadata_file, "r" )
                metadata = f.read()
                f.close()
            except:
                raise Exception("Could not open metadata file: {}".format( metadata_file ))

        if metadata is not None:
            msg.metadata = metadata

        if metadata_set:
            msg.mdset = True

        if deps_add:
            for d in deps_add:
                dep = msg.dep_add.add()
                if d[0] == "der":
                    dep.type = 0
                elif d[0] == "comp":
                    dep.type = 1
                elif d[0] == "ver":
                    dep.type = 2
                dep.id = self._resolve_id( d[1], context )

        if deps_rem:
            for d in deps_rem:
                dep = msg.dep_rem.add()
                if d[0] == "der":
                    dep.type = 0
                elif d[0] == "comp":
                    dep.type = 1
                elif d[0] == "ver":
                    dep.type = 2
                dep.id = self._resolve_id( d[1], context )

        return self._mapi.sendRecv( msg )


    ##
    # @brief Delete one or more data records
    #
    # Deletes onr or more data records and associated raw data.
    #
    # @param data_id - A record ID/alias or list of Ids/aliases (required)
    # @param context - User or project ID to use for alias resolution (optional)
    # @return An AckReply Google protobuf message object
    # @exception Exception: On invalid options or communication/server error
    #
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
    # @param encrypt - Encrypt mode (none, if avail, force)
    # @param wait - Wait for get to complete if True
    # @param timeout_sec - Timeout in second for polling Globus transfer status, 0 = no timeout
    # @param progress_bar - A progess bar class to display download progress (optional)
    # @param context - User or project ID to use for alias resolution (optional)
    # @return A XfrDataReply Google protobuf message object
    # @exception Exception: If both Globus and HTTP transfers are required
    # @exception Exception: On invalid options or communication/server error
    #
    def dataGet( self, item_id, path, encrypt = sdms.ENCRYPT_AVAIL, orig_fname = False, wait = False, timeout_sec = 0, progress_bar = None, context = None ):
        # Request server to map specified IDs into a list of specific record IDs.
        # This accounts for download of collections.

        msg = auth.DataGetRequest()
        msg.check = True
        for ids in item_id:
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
                setattr( xfr, "from", item[0] )
                xfr.to = path
                xfr.started = int(time.time())

                try:
                    filename = os.path.join( path, wget.filename_from_url( item[0] ))
                    # wget has a buggy filename uniquifier, appended integer will not increase after 1
                    new_filename = self._uniquifyFilename( filename )
                    if progress_bar != None:
                        print("Downloading {} to {}".format(item[1],new_filename))
                    data_file = wget.download( item[0], out=str(new_filename), bar = progress_bar )
                    if progress_bar != None:
                        print("")
                    xfr.to = data_file
                    xfr.updated = int(time.time())
                    xfr.failed = False
                except Exception as e:
                    xfr.failed = True
                    xfr.err_msg = str(e)
                    xfr.updated = int(time.time())
                    print( "Error: {}".format( e ))

            return [ reply, "HttpXfrDataReply" ]
        elif len(glob_list) > 0:
            # Globus transfers
            msg = auth.DataGetRequest()
            msg.id.extend(glob_list)
            msg.path = self._resolvePathForGlobus( path, False )
            msg.encrypt = encrypt
            msg.orig_fname = orig_fname

            reply = self._mapi.sendRecv( msg )

            if reply[0].task and wait:
                msg2 = auth.TaskViewRequest()
                msg2.task_id = reply[0].task.id
                elapsed = 0

                while True:
                    time.sleep(4)
                    elapsed = elapsed + 4

                    reply2 = self._mapi.sendRecv( msg2, nack_except = False )

                    # Not sure if this can happen:
                    if reply2[1] == "NackReply":
                        break

                    if reply2[0].task[0].status > 2:
                        break

                    if timeout_sec and elapsed > timeout_sec:
                        break

                reply = reply2

            return reply
        else:
            # Will land here if tried to get a collection with no records
            raise Exception("Specified record(s) contain no raw data.")


    ##
    # @brief Put (upload) raw data for a data record
    #
    # This method uploads raw data from the specified path to the specified
    # data record. The upload involves a Globus transfer, and the path may be a
    # full globus path, or a full or relative local file system path (the
    # current endpoint will be prepended).
    #
    # @param data_id - Data record ID/alias
    # @param path - Globus or file system source path
    # @param encrypt - Encrypt mode (none, if avail, force)
    # @param wait - Wait for put to complete if True
    # @param timeout_sec - Timeout in second for polling Globus transfer status, 0 = no timeout
    # @param extension - Override source file extension (default is autodetect)
    # @param context - User or project ID to use for alias resolution (optional)
    # @return A XfrDataReply Google protobuf message object
    # @exception Exception: On invalid options or communication/server error
    #
    def dataPut( self, data_id, path, encrypt = sdms.ENCRYPT_AVAIL, wait = False, timeout_sec = 0, extension = None, context = None ):
        msg = auth.DataPutRequest()
        msg.id = self._resolve_id( data_id, context )
        msg.path = self._resolvePathForGlobus( path, False )
        msg.encrypt = encrypt
        if extension:
            msg.ext = extension

        reply = self._mapi.sendRecv( msg )

        if ( reply[0].HasField( "task" ) == True ) and wait:
            msg2 = auth.TaskViewRequest()
            msg2.task_id = reply[0].task.id
            elapsed = 0

            while True:
                time.sleep(4)
                elapsed = elapsed + 4

                reply2 = self._mapi.sendRecv( msg2, nack_except = False )

                # Not sure if this can happen:
                if reply2[1] == "NackReply":
                    break

                #reply = reply2

                if reply2[0].task[0].status > 2:
                    break

                if timeout_sec and elapsed > timeout_sec:
                    break

            reply = reply2

        return reply


    ##
    # @brief Batch create data records
    #
    # Create one or more data records from JSON source files that specify all
    # metadata for the record. The source files may contain an individual JSON
    # object, or an array of JSON objects. There is a maximum limit to the
    # amount of data that can be sent in a single batch create request (see
    # _max_payload_size).
    #
    # @param file - An array of filenames to process
    # @param coll_id - Parent collection ID/alias (replaces parent field in JSON)
    # @param context - User or project ID to use for alias resolution (optional)
    # @return A RecordDataReply Google protobuf message object
    # @exception Exception: On invalid options or communication/server error
    #
    def dataBatchCreate( self, file, coll_id = None, context = None ):
        payload = []
        tot_size = 0

        for f in file:
            fp = pathlib.Path(f)

            if not fp.is_file():
                raise Exception( "File not found: " + f )

            tot_size += fp.stat().st_size
            if tot_size > API._max_payload_size:
                raise Exception( "Total batch create size exceeds limit ({})".format( API._max_payload_size ))

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


    # @brief Batch update data records
    #
    # Update one or more data records from JSON source files that specify all
    # updated metadata for the record. The source files may contain an
    # individual JSON object, or an array of JSON objects. There is a maximum
    # limit to the amount of data that can be sent in a single batch create
    # request (see _max_payload_size).
    #
    # @param file - An array of filenames to process
    # @return A RecordDataReply Google protobuf message object
    # @exception Exception: On invalid options or communication/server error
    #
    def dataBatchUpdate( self, file ):
        payload = []
        tot_size = 0

        for f in file:
            fp = pathlib.Path(f)

            if not fp.is_file():
                raise Exception( "File not found: " + f )

            tot_size += fp.stat().st_size
            if tot_size > API._max_payload_size:
                raise Exception( "Total batch update size exceeds limit ({})".format( API._max_payload_size ))

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

    ##
    # @brief View collection information
    #
    # View alias, title, and description fof a collection
    #
    # @param coll_id - Collection ID/alias to view
    # @param context - User or project ID to use for alias resolution (optional)
    # @return A CollDataReply Google protobuf message object
    # @exception Exception: On invalid options or communication/server error
    #
    def collectionView( self, coll_id, context = None ):
        msg = anon.CollViewRequest()
        msg.id = self._resolve_id( coll_id, context )
        #msg.id = self._resolve_coll_id( coll_id, context )

        return self._mapi.sendRecv( msg )


    ##
    # @brief Create a new collection
    #
    # Create a new collection with title, alias, and description. Note that if
    # topic is provided, the collection and contents become publicly readable
    # and will be presented in DataFed catalog browser.
    #
    # @param title - Title of collection (required)
    # @param alias - Alias of collection (optional)
    # @param description - Text description (optional)
    # @param tags - Array of tags (optional)
    # @param topic - Topic for publishing collection
    # @param parent_id - ID/alias of parent collection (default is root)
    # @param context - User or project ID to use for alias resolution (optional)
    # @return A CollDataReply Google protobuf message object
    # @exception Exception: On invalid options or communication/server error
    #
    def collectionCreate( self, title, alias = None, description = None, tags = None, topic = None, parent_id = None, context = None ):
        msg = auth.CollCreateRequest()
        msg.title = title

        if alias:
            msg.alias = alias

        if description:
            msg.desc = description

        if tags:
            msg.tags.extend( tags )

        if topic:
            msg.topic = topic

        if parent_id:
            msg.parent_id = self._resolve_id( parent_id, context )
            #msg.parent_id = self._resolve_coll_id( parent_id, context )

        return self._mapi.sendRecv( msg )


    # @brief Update an existing collection
    #
    # Update an existing collection with title, alias, and description. Note
    # that if topic is added, the collection and contents become publicly
    # readable and will be presented in DataFed catalog browser.
    #
    # @param coll_id - ID/alias of collection (required)
    # @param title - Title of collection (optional)
    # @param alias - Alias of collection (optional)
    # @param description - Text description (optional)
    # @param tags - Array of tags (optional)
    # @param topic - Topic for publishing collection
    # @param context - User or project ID to use for alias resolution (optional)
    # @return A CollDataReply Google protobuf message object
    # @exception Exception: On invalid options or communication/server error
    #
    def collectionUpdate( self, coll_id, title = None, alias = None, description = None, tags = None, topic = None, context = None ):
        msg = auth.CollUpdateRequest()
        msg.id = self._resolve_id( coll_id, context )

        if title is not None:
            msg.title = title

        if alias is not None:
            msg.alias = alias

        if description is not None:
            msg.desc = description

        if tags is not None:
            if not tags:
                msg.tags_clear = True
            else:
                msg.tags.extend( tags )

        if topic is not None:
            msg.topic = topic

        return self._mapi.sendRecv( msg )


    ##
    # @brief Delete one or more existing collections
    #
    # Deletes onr or more collections and contained items. When a collection is
    # deleted, all contained collections are also deleted; however, contained
    # data records are only deleted if they are not linked to another
    # collection not involved in the deletion.
    #
    # @param coll_id - A collection ID/alias or list of IDs/aliases (required)
    # @param context - User or project ID to use for alias resolution (optional)
    # @return An AckReply Google protobuf message object
    # @exception Exception: On invalid options or communication/server error
    #
    def collectionDelete( self, coll_id, context = None ):
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
    # List items linked to the specified collection.
    #
    # @param coll_id - Collection ID or alias
    # @param offset - Offset of listing results for paging (optional)
    # @param count - Count (limit) of listing results for paging (optional)
    # @param context - User or project ID to use for alias resolution (optional)
    # @return A ListingReply Google protobuf message object
    # @exception Exception: On invalid options or communication/server error
    #
    def collectionItemsList( self, coll_id, offset = 0, count = 20, context = None ):
        msg = anon.CollReadRequest()
        msg.count = count
        msg.offset = offset
        msg.id = self._resolve_id( coll_id, context )

        return self._mapi.sendRecv( msg )


    ##
    # @brief Update (add/remove) items linked to a collection
    #
    # Add and/or remove items linked to a specified collection. Note that data
    # records may be linked to any number of collections, but collections can
    # only be linked to one parent collection. If a collection is added to a
    # new parent collection, it is automatically unlinked from it's current
    # parent. An ancestor (parent, grandparent, etc) collection cannot be
    # linked to a descendent collection.
    #
    # Items removed from a collection that have no other parent collections
    # are automatically re-linked to the root collection. The return reply
    # of this method contains any such re-linked items.
    #
    # @param coll_id - Collection ID or alias
    # @param add_ids - String or list of ID/alias of record(s) and/or collection(s) to add (optional)
    # @param rem_ids - String or list of ID/alias of record(s) and/or collection(s) to remove (optional)
    # @param context - User or project ID to use for alias resolution (optional)
    # @return A ListingReply Google protobuf message object containing re-linked items
    # @exception Exception: On invalid options or communication/server error
    #
    def collectionItemsUpdate( self, coll_id, add_ids = None, rem_ids = None, context = None ):
        msg = auth.CollWriteRequest()
        msg.id = self._resolve_id( coll_id, context )

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


    ##
    # @brief Get parents of specifies collection
    #
    # Gets the parents of the specified collection up to the root collection.
    #
    # @param coll_id - Collection ID or alias
    # @param inclusive - Include starting collection if True
    # @param context - User or project ID to use for alias resolution (optional)
    # @return A CollPathReply Google protobuf message object
    # @exception Exception: On invalid options or communication/server error
    #
    def collectionGetParents( self, coll_id, inclusive = False, context = None ):
        msg = auth.CollGetParentsRequest()
        msg.id = self._resolve_id( coll_id, context )
        msg.inclusive = inclusive

        return self._mapi.sendRecv( msg )


    # =========================================================================
    # ----------------------------------------------------------- Query Methods
    # =========================================================================

    ##
    # @brief List saved queries
    #
    # List saved queries.
    #
    # @param offset - Offset of listing results for paging (optional)
    # @param count - Count (limit) of listing results for paging (optional)
    # @return A ListingReply Google protobuf message object
    # @exception Exception: On invalid options or communication/server error
    #
    def queryList( self, offset = 0, count = 20 ):
        msg = auth.QueryListRequest()
        msg.offset = offset
        msg.count = count

        return self._mapi.sendRecv( msg )


    ##
    # @brief View a saved query
    #
    # View specified saved query.
    #
    # @param query_id - ID of saved query to view
    # @return A QueryDataReply Google protobuf message object
    # @exception Exception: On invalid options or communication/server error
    #
    def queryView( self, query_id ):
        msg = auth.QueryViewRequest()
        msg.id = query_id

        return self._mapi.sendRecv( msg )


    ##
    # @brief Create a new saved query
    #
    # Create a new saved query. Default scope inclues owned data and all data
    # associated with owned and managed projects, as well as member projects.
    #
    # @param title - Title of query (required)
    # @param id - ID/alias query text (optional)
    # @param text - Title / description text query (optional)
    # @param meta - Metadata query (optional)
    # @param no_default - Omit default scopes if True (optional)
    # @param coll - A collection ID/alias to add to scope (multiple allowed)
    # @param proj - A project ID to add to scope (multiple allowed)
    # @return A QueryDataReply Google protobuf message object
    # @exception Exception: On invalid options or communication/server error
    #
    def queryCreate( self, title, id = None, text = None, meta = None, no_default = None, coll = None, proj = None ):
        msg = auth.QueryCreateRequest()
        msg.title = title
        msg.query = self._makeQueryString( id, text, meta, no_default, coll, proj )

        return self._mapi.sendRecv( msg )


    ##
    # @brief Update an existing saved query
    #
    # Update an existing saved query. Can specity new title and query
    # expressions; however scope cannot be changed.
    #
    # @param query_id - Query ID (required)
    # @param id - ID/alias query text (optional)
    # @param text - Title / description text query (optional)
    # @param meta - Metadata query (optional)
    # @return A QueryDataReply Google protobuf message object
    # @exception Exception: On invalid options or communication/server error
    #
    def queryUpdate( self, query_id, title = None, id = None, text = None, meta = None ):
        msg = auth.QueryViewRequest()
        msg.id = query_id

        reply = self._mapi.sendRecv( msg )

        msg = auth.QueryUpdateRequest()
        msg.id = query_id

        for q in reply[0].query:
            if title:
                msg.title = title
            else:
                msg.title = q.title

            qry = jsonlib.loads( q.query )

            if id:
                qry["id"] = id
            elif id == "":
                qry.pop("id",None)

            if text:
                qry["text"] = text
            elif text == "":
                qry.pop("text",None)

            if meta:
                qry["meta"] = meta
            elif meta == "":
                qry.pop("meta",None)

            if not (('id' in qry and qry["id"]) or ('text' in qry and qry["text"]) or ('meta' in qry and qry["meta"])):
                raise Exception("No search terms left in query.")

            msg.query = jsonlib.dumps( qry )
            break

        return self._mapi.sendRecv( msg )


    ##
    # @brief Delete a saved query
    #
    # Delete a saved query.
    #
    # @param query_id - Query ID to delete (required)
    # @return An AckReply Google protobuf message object
    # @exception Exception: On invalid options or communication/server error
    #
    def queryDelete( self, query_id ):
        msg = auth.QueryDeleteRequest()
        msg.id.append( query_id )

        return self._mapi.sendRecv( msg )


    ##
    # @brief Execute a stored query
    #
    # Execute a store query and return matches.
    #
    # @param query_id - Query ID to execute (required)
    # @param offset - Offset of listing results for paging (optional)
    # @param count - Count (limit) of listing results for paging (optional)
    # @return A ListingReply Google protobuf message object
    # @exception Exception: On invalid options or communication/server error
    #
    def queryExec( self, query_id, offset = 0, count = 20 ):
        msg = auth.QueryExecRequest()
        msg.id = query_id
        msg.offset = offset
        msg.count = count

        return self._mapi.sendRecv( msg )


    ##
    # @brief Directly run a manually entered query
    #
    # Directly run a manually entered query and return matches.
    #
    # @param id - ID/alias query text (optional)
    # @param text - Title / description text query (optional)
    # @param meta - Metadata query (optional)
    # @param no_default - Omit default scopes if True (optional)
    # @param coll - A collection ID/alias to add to scope (multiple allowed)
    # @param proj - A project ID to add to scope (multiple allowed)
    # @param offset - Offset of listing results for paging (optional)
    # @param count - Count (limit) of listing results for paging (optional)
    # @return A ListingReply Google protobuf message object
    # @exception Exception: On invalid options or communication/server error
    #
    def queryDirect( self, id = None, text = None, meta = None, no_default = None, coll = None, proj = None, offset = 0, count = 20 ):
        msg = auth.RecordSearchRequest()
        msg.query = self._makeQueryString( id, text, meta, no_default, coll, proj )
        msg.offset = offset
        msg.count = count

        return self._mapi.sendRecv( msg )


    # =========================================================================
    # ------------------------------------------------------------ User Methods
    # =========================================================================

    ##
    # @brief List collaborators
    #
    # List collaborators. Collaborators are defined as users that have projects
    # in common with the current user, or that have data-sharing relationships
    # with the current user.
    #
    # @param offset - Offset of listing results for paging (optional)
    # @param count - Count (limit) of listing results for paging (optional)
    # @return A UserDataReply Google protobuf message object
    # @exception Exception: On invalid options or communication/server error
    #
    def userListCollaborators( self, offset = 0, count = 20 ):
        msg = auth.UserListCollabRequest()
        msg.offset = offset
        msg.count = count

        return self._mapi.sendRecv( msg )


    ##
    # @brief List all users
    #
    # List all users.
    #
    # @param offset - Offset of listing results for paging (optional)
    # @param count - Count (limit) of listing results for paging (optional)
    # @return A UserDataReply Google protobuf message object
    # @exception Exception: On invalid options or communication/server error
    #
    def userListAll( self, offset = 0, count = 20 ):
        msg = auth.UserListAllRequest()
        msg.offset = offset
        msg.count = count

        return self._mapi.sendRecv( msg )


    ##
    # @brief View user information
    #
    # View user information.
    #
    # @param uid - ID of user to view
    # @return A UserDataReply Google protobuf message object
    # @exception Exception: On invalid options or communication/server error
    #
    def userView( self, uid ):
        msg = anon.UserViewRequest()
        msg.uid = uid

        return self._mapi.sendRecv( msg )


    # =========================================================================
    # --------------------------------------------------------- Project Methods
    # =========================================================================

    ##
    # @brief List projects associated with current user
    #
    # List projects that are owned or managed by the current user, as well as
    # projects were the current user is a member.
    #
    # @param owned - Include owned projects
    # @param admin - Include managed projects
    # @param member - Include projects where current user is a member
    # @param offset - Offset of listing results for paging (optional)
    # @param count - Count (limit) of listing results for paging (optional)
    # @return A ListingReply Google protobuf message object
    # @exception Exception: On invalid options or communication/server error
    #
    def projectList( self, owned = True, admin = True, member = True, offset = 0, count = 20 ):
        msg = auth.ProjectListRequest()
        msg.as_owner = owned
        msg.as_admin = admin
        msg.as_member = member
        msg.offset = offset
        msg.count = count

        return self._mapi.sendRecv( msg )


    ##
    # @brief View project information
    #
    # View project information (title, description, owner, etc.)
    #
    # @param project_id - ID of project to view
    # @return A ProjectDataReply Google protobuf message object
    # @exception Exception: On invalid options or communication/server error
    #
    def projectView( self, project_id ):
        msg = anon.ProjectViewRequest()
        msg.id = project_id

        return self._mapi.sendRecv( msg )

    def projectGetRole( self, project_id ):
        msg = auth.ProjectGetRoleRequest()
        msg.id = project_id

        reply = self._mapi.sendRecv( msg )

        return reply[0].role

    # =========================================================================
    # ----------------------------------------------------- Shared Data Methods
    # =========================================================================

    ##
    # @brief List users/projects with shared data
    #
    # List users and/or that have shared data with client/subject.
    #
    # @return A ListingReply Google protobuf message object
    # @exception Exception: On invalid options or communication/server error
    #
    def sharesListOwners( self, inc_users = None, inc_projects = None, subject = None ):
        msg = auth.ACLBySubjectRequest()

        if inc_users != None:
            msg.inc_users = inc_users

        if inc_projects != None:
            msg.inc_projects = inc_projects

        if subject != None:
            msg.subject = subject.lower()

        return self._mapi.sendRecv( msg )

    '''
    ##
    # @brief List users with shared data
    #
    # List users that have shared data. Only users that have shared data with
    # the current user are listed, not users that the current user has shared
    # data with.
    #
    # @return A UserDataReply Google protobuf message object
    # @exception Exception: On invalid options or communication/server error
    #
    def sharedUsersList( self ):
        msg = auth.ACLByUserRequest()

        return self._mapi.sendRecv( msg )


    ##
    # @brief List projects with shared data
    #
    # List projects that have shared data with the current user.
    #
    # @return A ProjectDataReply Google protobuf message object
    # @exception Exception: On invalid options or communication/server error
    #
    def sharedProjectsList( self ):
        msg = auth.ACLByProjRequest()

        return self._mapi.sendRecv( msg )
    '''

    ##
    # @brief List shared data records and collections
    #
    # List shared data records and collections by user/project ID.
    #
    # @param owner_id - User or project ID
    # @return A ListingReply Google protobuf message object
    # @exception Exception: On invalid options or communication/server error
    #
    def sharesListItems( self, owner_id, context = None, offset = None, count = None ):
        # TODO add support for offset & count

        msg = auth.ACLListItemsBySubjectRequest()
        msg.owner = owner_id.lower()
        if context != None:
            msg.subject = context.lower()

        return self._mapi.sendRecv( msg )


    # =========================================================================
    # --------------------------------------------------- Data Transfer Methods
    # =========================================================================

    ##
    # @brief List recent tasks
    #
    # List recent Globus transfers. If no time or status filter options are
    # provided, all Globus transfers initiated by the current user are listed,
    # most recent first. Note that the DataFed server periodically purges
    # transfer history such that only up to 30 days of history are retained.
    #
    # @param time_from - List from specified date/time (M/D/YYYY[,HH:MM])
    # @param time_to - List to specified date/time (M/D/YYYY[,HH:MM])
    # @param since - List from specified time string (second default, suffix h = hours, d = days, w = weeks)
    # @param status - List matching status (0 to 4)
    # @param offset - Offset of matches
    # @param count - Count of matches
    # @return A XfrDataReply Google protobuf message object
    # @exception Exception: On invalid options or communication/server error
    #
    def taskList( self, time_from = None, time_to = None, since = None, status = None, offset = 0, count = 20 ):
        if since != None and (time_from != None or time_to != None):
            raise Exception("Cannot specify 'since' and 'from'/'to' ranges.")

        msg = auth.TaskListRequest()

        if time_from != None:
            ts = self.strToTimestamp( time_from )
            if ts == None:
                raise Exception("Invalid time format for 'from' option.")

            setattr( msg, "from", ts )

        if time_to != None:
            ts = self.strToTimestamp( time_to )
            if ts == None:
                raise Exception("Invalid time format for 'time_to' option.")

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
            for s in status:
                stat = s.lower()
                if stat in ["0","1","2","3","4"]:
                    msg.status.append( int( stat ))
                elif stat == "queued":
                    msg.status.append( 0 )
                elif stat == "ready":
                    msg.status.append( 1 )
                elif stat == "running":
                    msg.status.append( 2 )
                elif stat == "succeeded":
                    msg.status.append( 3 )
                elif stat == "failed":
                    msg.status.append( 4 )

        if offset != None:
            try:
                tmp = int(offset)
            except:
                raise Exception("Invalid offset value.")

            if offset >= 0:
                msg.offset = offset
            else:
                raise Exception("Invalid offset value.")

        if count != None:
            try:
                tmp = int(count)
            except:
                raise Exception("Invalid count value.")

            if count > 0:
                msg.count = count
            else:
                raise Exception("Invalid count value.")

        return self._mapi.sendRecv( msg )


    ##
    # @brief View task information
    #
    # Show task information. Use the ID argument to view a specific task
    # record, or omit to view the latest task initiated by the current user.
    #
    # @param task_id - Task ID to view (optional)
    # @return A TaskDataReply Google protobuf message object
    # @exception Exception: On invalid options or communication/server error
    #
    def taskView( self, task_id = None ):
        if task_id:
            msg = auth.TaskViewRequest()
            msg.task_id = task_id

            reply = self._mapi.sendRecv( msg )
        else:
            msg = auth.TaskListRequest()
            msg.offset = 0
            msg.count = 1

            reply = self._mapi.sendRecv( msg )

        return reply

    # =========================================================================
    # -------------------------------------------------------- Endpoint Methods
    # =========================================================================

    ##
    # @brief List recent endpoints
    #
    # List recently used Globus endpoints
    #
    # @return A UserGetRecentEPReply Google protobuf message object
    # @exception Exception: On communication/server error
    #
    def endpointListRecent( self ):
        msg = auth.UserGetRecentEPRequest()

        return self._mapi.sendRecv( msg )

    ##
    # @brief Get default endpoint
    #
    # Get configured default endpoint
    #
    # @return The default endpoint string, or None if not configured
    #
    def endpointDefaultGet( self ):
        return self.cfg.get( "default_ep" )

    ##
    # @brief Set the default endpoint
    #
    # Set the default Globus endpoint (used to set initial current endpoint).
    #
    # @param endpoint - New default endpoint
    # @return None
    #
    def endpointDefaultSet( self, endpoint ):
        # TODO validate ep is UUID or legacy (not an ID)
        self.cfg.set( "default_ep", endpoint, True )
        if not self._cur_ep:
            self._cur_ep = endpoint

    ##
    # @brief Get current endpoint
    #
    # Get current Globus endpoint
    #
    # @return The current endpoint string, or None if not set
    #
    def endpointGet( self ):
        return self._cur_ep

    ##
    # @brief Set current endpoint
    #
    # Set current Globus endpoint (added to partial get/put paths)
    #
    # @param endpoint - New current Globus endpoint
    # @return None
    #
    def endpointSet( self, endpoint ):
        # TODO validate ep is UUID or legacy (not an ID)
        self._cur_ep = endpoint


    # =========================================================================
    # --------------------------------------------------- Miscellaneous Methods
    # =========================================================================

    ##
    # @brief Setup local credentials
    #
    # This command installs DataFed credentials for the current user in the
    # configured client configuration directory. Subsequent use of the DataFed
    # API will read these credentials instead of requiring manual authentication.
    #
    # @exception Exception: On configuration or communication/server error
    # @return None
    #
    def setupCredentials( self ):
        cfg_dir = self.cfg.get("client_cfg_dir")
        pub_file = self.cfg.get("client_pub_key_file")
        priv_file = self.cfg.get("client_priv_key_file")

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

    ##
    # @brief Set current user/project context
    #
    # Set current context which is used to resolve relative aliases.
    #
    # @param item_id - A user or project ID
    # @exception Exception: On invalid options or communication/server error
    # @return None
    #
    def setContext( self, item_id = None ):
        if item_id == None:
            if self._cur_sel == self._uid:
                return

            self._cur_sel = self._uid
            self._cur_alias_prefix = ""
        else:
            id2 = item_id

            if id2[0:2] == "p/":
                msg = anon.ProjectViewRequest()
                msg.id = id2
            else:
                if id2[0:2] != "u/":
                    if id2.find("/") > 0 or id2.find(":") > 0:
                        raise Exception("setContext invalid ID, '" + id2 + "'. Must be a user or a project ID")
                    id2 = "u/" + id2

                msg = anon.UserViewRequest()
                msg.uid = id2

            # Don't need reply - just using to throw an except if id/uid is invalid
            self._mapi.sendRecv( msg )
            self._cur_sel = id2

            if id2[0] == "u":
                #self._cur_coll = "c/u_" + self._cur_sel[2:] + "_root"
                self._cur_alias_prefix = "u:" + self._cur_sel[2:] + ":"
            else:
                #self._cur_coll = "c/p_" + self._cur_sel[2:] + "_root"
                self._cur_alias_prefix = "p:" + self._cur_sel[2:] + ":"


    ##
    # @brief Get current context
    #
    # Gets the current context which is used to resolve relative aliases.
    #
    # @return The current user or project ID context string
    #
    def getContext( self ):
        return self._cur_sel


    ##
    # @brief Convert timestamp into standard string format
    #
    # @param ts - Timestamp in local time
    # @return A string representation of the timestamp in local time
    #
    def timestampToStr( self, ts ):
        return time.strftime("%m/%d/%Y,%H:%M", time.localtime( ts ))


    ##
    # @brief Convert a date/time string into a timestamp
    #
    # @param time_str - Date/time in %m/%d/%Y[,%H:%M[:%S]] format
    # @return The integer timestamp representation of the time string in local time
    #
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

    ##
    # @brief Convert integer size to string
    #
    # Convert integer size to human readable size string with metric units.
    #
    # @param size - Size value to convert
    # @param precision - Precision of converted value
    # @return The size as a string with byte units
    #
    def sizeToStr( self, size, precision = 1 ):
        if size == 0:
            return "0"
        elif size < 1024:
            return str(size) + " B"
        elif size < 1048576:
            denom = 1024
            unit = "KB"
        elif size < 1073741824:
            denom = 1048576
            unit = "MB"
        elif size < 1099511627776:
            denom = 1073741824
            unit = "GB"
        else:
            denom = 1099511627776
            unit = "TB"

        return "{:.{}f} {}".format( size/denom, precision, unit )

    # =========================================================================
    # --------------------------------------------------------- Private Methods
    # =========================================================================


    # @brief Compose query parameters into a query string
    def _makeQueryString( self, id, text, meta, no_default, coll, proj ):
        if id is None and text is None and meta is None:
            raise Exception("No search terms provided.")

        if no_default and (( coll is None or len( coll ) == 0 ) and ( proj is None or len( proj ) == 0 )):
            raise Exception("Must specify one or more collections or projects to search if 'no default' option is enabled.")

        qry = "{"

        if id:
            qry = qry + "\"id\":\"" + id + "\","

        if text:
            qry = qry + "\"text\":\"" + text + "\","

        if meta:
            qry = qry + "\"meta\":\"" + meta + "\","

        scopes = ""
        delim = ""

        if not no_default:
            scopes = scopes + "{\"scope\":1},{\"scope\":3},{\"scope\":4},{\"scope\":5}"

        if coll:
            if len(scopes):
                delim = ","

            for c in coll:
                scopes = scopes + delim + "{\"scope\":6,\"id\":\"" + self._resolve_id( c ) + "\"}"
                delim = ","

        if proj:
            if len(scopes):
                delim = ","

            for p in proj:
                scopes = scopes + delim + "{\"scope\":2,\"id\":\"" + p + "\"}"
                delim = ","

        # TODO - Add topics when topics are supported by CLI

        return qry + "\"scopes\":[" + scopes + "]}"

    # If specified filename exists, a new unique filename will be generated.
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

    # Resolve relative local path
    def _resolvePathForHTTP( self, path ):
        if path[0] == "~":
            res = pathlib.Path(path).expanduser().resolve()
        elif path[0] == "." or path[0] != '/':
            res = pathlib.Path.cwd() / path
            res = res.resolve()
        else:
            res = path

        return str(res)


    # Resolve relative paths and prefix with current endpoint if needed
    def _resolvePathForGlobus( self, path, must_exist ):
        # Check if this is a full Globus path with either a UUID or legacy endpoint prefix
        if re.match( API._endpoint_legacy, path ) or re.match( API._endpoint_uuid, path ):
            return path

        # Does not have an endpoint prefix, might be a full or relative path

        if self._cur_ep == None:
            raise Exception("No endpoint set.")

        if path[0] == "~":
            _path = pathlib.Path( path ).expanduser()
        elif path[0] == "." or path[0] != "/": # Relative path: ./something ../something or something
            _path = pathlib.Path.cwd() / path
        else:
            _path = pathlib.Path(path)

        if must_exist:
            _path = str(_path.resolve())
        else:
            # Can't use resolve b/c it throws an exception when a path doesn't exist pre python 3.6
            # Must manually locate the lowest relative path component and resolve only to that point
            # Then append then remainder to the resolved portion

            idx = 0
            rel = None

            for p in _path.parts:
                if p == "." or p == "..":
                    rel = idx
                idx = idx + 1

            if rel != None:
                basep = pathlib.Path()
                endp = pathlib.Path()
                idx = 0
                for p in _path.parts:
                    if idx <= rel:
                        basep = basep.joinpath( p )
                    else:
                        endp = endp.joinpath( p )
                    idx = idx + 1

                _path = basep.resolve().joinpath(endp)

            winp = pathlib.PurePath(_path)

            # TODO The follow windows-specific code needs to be tested on windows...
            if isinstance(winp, pathlib.PureWindowsPath):
                if winp.drive:
                    drive_name = winp.drive.replace(':', '')
                    parts = winp.parts[1:]
                    winp = pathlib.PurePosixPath('/' + drive_name)
                    for item in parts:
                        winp = winp / str(item)  # adds each part
                    _path = str(_path)
                elif not winp.drive:
                    _path = winp.as_posix()
                    if _path[0] != '/':
                        _path = "/" + _path
            else:
                _path = str(_path)

        return self._cur_ep + _path


    # Resolve ID by prefixing relative aliases with current or specifies context
    def _resolve_id( self, item_id, context = None ):
        if ( len( item_id ) > 2 and item_id[1] == "/" ) or ( item_id.find(":") > 0 ):
            return item_id

        if context:
            if context[:2] == "p/":
                return "p:" + context[2:] + ":" + item_id
            elif context[:2] == "u/":
                return "u:" + context[2:] + ":" + item_id
            else:
                return "u:" + context + ":" + item_id
        else:
            return self._cur_alias_prefix + item_id


    # Set any missing config options to sane defaults
    def _setSaneDefaultOptions( self ):
        opts = self.cfg.getOpts()

        # Examine initial configuration options and set & save defaults where needed
        save = False

        if not "server_host" in opts:
            self.cfg.set( "server_host", "datafed.ornl.gov" )
            opts["server_host"] = "datafed.ornl.gov"
            save = True

        if not "server_port" in opts:
            self.cfg.set( "server_port", 7512 )
            opts["server_port"] = 7512
            save = True

        if not "server_pub_key_file" in opts:
            serv_key_file = None

            if "server_cfg_dir" in opts:
                serv_key_file = os.path.expanduser( os.path.join( opts['server_cfg_dir'], "datafed-core-key.pub" ))
                self.cfg.set( "server_pub_key_file", serv_key_file )
                opts["server_pub_key_file"] = serv_key_file

            if not serv_key_file or not os.path.exists( serv_key_file ):
                serv_key_file = None
                if "client_cfg_dir" in opts:
                    serv_key_file = os.path.expanduser( os.path.join( opts['client_cfg_dir'], "datafed-core-key.pub" ))
                    self.cfg.set( "server_pub_key_file", serv_key_file )
                    opts["server_pub_key_file"] = serv_key_file
                    save = True

                if not serv_key_file:
                    raise Exception("Could not find location of server public key file.")

                if not os.path.exists(serv_key_file):
                    # Make default server pub key file
                    url = "https://"+opts["server_host"]+"/datafed-core-key.pub"
                    wget.download( url, out=serv_key_file )

        if not "client_pub_key_file" in opts or not "client_priv_key_file" in opts:
            if not "client_cfg_dir" in opts:
                raise Exception("Client key file(s) or client configuration directory not specified or invalid.")

            if not "client_pub_key_file" in opts:
                key_file = os.path.expanduser( os.path.join( opts['client_cfg_dir'], "datafed-user-key.pub" ))
                self.cfg.set( "client_pub_key_file", key_file )
                opts["client_pub_key_file"] = key_file
                save = True

            if not "client_priv_key_file" in opts:
                key_file = os.path.expanduser( os.path.join( opts['client_cfg_dir'], "datafed-user-key.priv" ))
                self.cfg.set( "client_priv_key_file", key_file )
                opts["client_priv_key_file"] = key_file
                save = True

        if save:
            self.cfg.save()

        return opts

