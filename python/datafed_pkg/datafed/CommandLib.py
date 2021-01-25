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


class API:
    """
    A high-level messaging interface to the DataFed core server

    The DataFed CommandLib.API class provides a high-level interface
    for sending requests to a DataFed server. Requests are sent via python
    class methods and replies are (currently) returned as Google Protobuf message objects.
    These reply messages are defined in the \*.proto files included in the
    DataFed client package. Basic functionality of th API class mirrors the
    capabilities exposed in the DataFed CLI.

    The Config class is used to load configuration settings, but settings
    (all or some) may also be supplied as an argument to the constructor.
    On success, a secure connection is established to the configured DataFed
    core server. If user credentials are installed, the associated user
    will be authenticated; otherwise an anonymous connection will be
    created. Use the getAuthUser() method to check is authentication is
    required after constructing an API instance.

    Parameters
    ----------
    opts : dict, Optional
        Configuration options

    Attributes
    ----------
    _max_md_size : int.
        Maximum size of metadata in bytes.
        Currently set to 102400
    _max_payload_size : int
        Maximum limit for the amount of data that can be sent in a single batch
        create request.
        Currently set to 1048576

    Raises
    ------
    Exception : if invalid config values are present
    """

    _max_md_size = 102400
    _max_payload_size = 1048576
    _endpoint_legacy = re.compile(r'[\w\-]+#[\w\-]+')
    _endpoint_uuid = re.compile( r'[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}', re.I )

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

    def getAuthUser( self ):
        """
        Get current authenticated user, if any.

        Returns current user ID If current connection is authenticated,
        otherwise returns None.

        Returns
        -------
        str :
            Authenticated user ID or None if not authenticated
        """
        return self._uid

    def logout( self ):
        """
        Logout current client, if any.

        If connected, logs-out by reseting underlying connection and clearing
        current user.

        Returns
        -------
        None
        """
        if self._uid:
            self._mapi.logout()
            self._uid = None
            self._cur_sel = None

    def loginByPassword( self, uid, password ):
        """
        Manually authenticate client by user id and password

        If not authenticated, this method attempts manual authentication
        using the supplied DataFed user ID and password.

        Parameters
        ----------
        uid : str
            DataFed user ID
        password : str
            DataFed password

        Returns
        -------
        None

        Raises
        ------
        Exception : if authentication fails.
        """
        self.logout()

        self._mapi.manualAuthByPassword( uid, password )

        self._uid = self._mapi._uid
        self._cur_sel = self._mapi._uid

    def generateCredentials( self ):
        """
        Generate/download local user credentials

        Requests the DataFed server to generate and send local credentials for
        the current user. These credentials should be saved/loaded from a
        set of public/private client keys files as specified via the Config
        module.

        Returns
        -------
        msg: Google protobuf message

        Raises
        ------
        Exception: On communication or server error
        """
        msg = auth.GenerateCredentialsRequest()

        return self._mapi.sendRecv( msg )


    # =========================================================================
    # ------------------------------------------------------------ Data Methods
    # =========================================================================

    def dataView( self, data_id, details = False, context = None ):
        """
        View a data record

        Retrieves all metadata associated with record with metadata (without
        raw data).

        Parameters
        ----------
        data_id : str
            Data record ID or alias
        details : str, Optional. Default = False
            NOT USED
        context : str, Optional. Default = None
            User ID or project ID to use for alias resolution.

        Returns
        -------
        msg : RecordDataReply Google protobuf message
            Response from DataFed

        Raises
        ------
        Exception : On communication or server error
        """
        msg = anon.RecordViewRequest()
        msg.id = self._resolve_id( data_id, context )
        msg.details = details

        return self._mapi.sendRecv( msg )

    def dataCreate( self, title, alias = None, description = None, tags = None, extension = None,
        metadata = None, metadata_file = None, parent_id = "root", deps = None, repo_id = None, context = None ):
        """
        Create a new data record

        Create a new data record. May specify alias, containing collection,
        metadata, dependencies, and allocation. Raw data must be uploaded
        separately. Cannot use both metadata and metadata_file options.

        Parameters
        ----------
        title : str
            Title of record
        alias : str, Optional. Default = None
            Alias of record
        description : str, Optional. Default = None
            Text description of record
        tags : list of str, Optional. Default = None
            Tags that describe the record
        extension : str, Optional. Default = None
            Extension for raw data file to use / override
        metadata : JSON string, Optional. Default = None
            Domain-specific metadata described in dictionary form.
            This dictionary can be nested.
        metadata_file : str, Optional. Default = None
            Path to local JSON file containing domain-specific metadata
        parent_id : str, Optional. Default = "root"
            ID/alias of collection within which to create this record.
            By default, the record will be created in the user's root collection
        deps : list, Optional. Default = None
            Dependencies of this data record specified as an array of
            lists as [ [relation type <str>,  record ID <str>], [], [] ... ].
            Relation types currently supported are:
            * "der" - Is derived from
            * "comp" - Is comprised of
            * "ver" - Is new version of
        repo_id : str, Optional. Default = None
            ID of data repository to create this record in.
            By default, the default repository will be chosen.
        context : str, Optional. Default = None
            User ID or project ID to use for alias resolution.

        Returns
        -------
        msg : RecordDataReply Google protobuf message
            Response from DataFed

        Raises
        ------
        Exception : On communication or server error
        """

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

    def dataUpdate( self, data_id, title = None, alias = None, description = None, tags = None,
        extension = None, metadata = None, metadata_file = None, metadata_set = False, deps_add = None,
        deps_rem = None, context = None ):
        """
        Update an existing data record

        Update an existing data record. May specify title, alias, metadata,
        dependencies, and allocation. Raw data must be uploaded separately.
        Cannot use both metadata and metadata_file options.

        Parameters
        ----------
        data_id : str
            Data record ID or alias
        title : str
            Title of record
        alias : str, Optional. Default = None
            Alias of record
        description : str, Optional. Default = None
            Text description of record
        tags : list of str, Optional. Default = None
            Tags that describe the record
        extension : str, Optional. Default = None
            Extension for raw data file to use / override
        metadata : JSON string, Optional. Default = None
            Domain-specific metadata described in dictionary form.
            This dictionary can be nested.
        metadata_file : str, Optional. Default = None
            Path to local JSON file containing domain-specific metadata
        metadata_set : bool, Optional. Default = False
            Set to True to replace existing metadata with provided.
            Otherwise, and by default, provided metadata will be merged with
            existing metadata.
        deps_add : list, Optional. Default = None
            Dependencies of this data record to add, specified as an array of
            lists as [ [relation type <str>,  record ID <str>], [], [] ... ].
            Relation types currently supported are:
            * "der" - Is derived from
            * "comp" - Is comprised of
            * "ver" - Is new version of
        deps_rem : list, Optional. Default = None
            Dependencies of this data record to remove, specified as an array of
            lists as [ [relation type <str>,  record ID <str>], [], [] ... ].
            Relation types currently supported are:
            * "der" - Is derived from
            * "comp" - Is comprised of
            * "ver" - Is new version of
        context : str, Optional. Default = None
            User ID or project ID to use for alias resolution.

        Returns
        -------
        msg : RecordDataReply Google protobuf message
            Response from DataFed

        Raises
        ------
        Exception : On communication or server error
        """

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

    def dataDelete( self, data_id, context = None ):
        """
        Deletes onr or more data records and associated raw data.

        Parameters
        ----------
        data_id : str
            Data record ID or alias
        context : str, Optional. Default = None
            User ID or project ID to use for alias resolution.

        Returns
        -------
        msg : RecordDataReply Google protobuf message
            Response from DataFed

        Raises
        ------
        Exception : On invalid options or communication / server error
        """
        msg = auth.RecordDeleteRequest()

        if isinstance( data_id, list ):
            for i in data_id:
                msg.id.append( self._resolve_id( i, context ))
        else:
            msg.id.append( self._resolve_id( data_id, context ))

        return self._mapi.sendRecv( msg )

    def dataGet( self, item_id, path, encrypt = sdms.ENCRYPT_AVAIL,
                 orig_fname = False, wait = False, timeout_sec = 0,
                 progress_bar = None, context = None ):
        """
        Get (download) raw data for one or more data records and/or collections

        This method downloads to the specified path the raw data associated with
        a specified data record, or the records contained in a collection, or
        with a list of records and/or collections. The download may involve
        either a Globus transfer, or an HTTP transfer. The path may be a full
        globus path (only works for Globus transfers), or a full or relative
        local file system path (will prepend the default endpoint for Globus
        transfers).

        Parameters
        ----------
        item_id : str or list or str
            Data record or collection ID/alias, or a list of IDs/aliases
        path : str
            Globus or local file system destination path
        encrypt :
            Encrypt mode (none, if avail, force)
        orig_fname : bool, Optional. Default = False
            If set to True, the file(s) contained in the record(s) will be
            downloaded with their original name(s).
            Otherwise, and by default, the files will be named according to
            their unique record ID followed by the original or overriden
            extension.
        wait : bool, Optional. Default = False
            Set to true to wait until the file transfer is complete.
            Otherwise, and by default, the transfer will take place in the
            background / asynchronously
        timeout_sec : int, Optional. Default = 0
            Timeout in seconds for polling the status of the Globus transfer.
            By default, there is no timeout.
        progress_bar : callable, Optional. Default = None
            A progress bar class to display progress for HTTP download.
            This kwarg is passed on as the ``bar`` kwarg of wget.download().
            By default, wget will use dots to display progress.
        context : str, Optional. Default = None
            User ID or project ID to use for alias resolution.

        Returns
        -------
        msg : XfrDataReply Google protobuf message
            Response from DataFed

        Raises
        ------
        Exception : On invalid options or communication / server error.
        Exception : If both Globus and HTTP transfers are required
        """
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

    def dataPut( self, data_id, path, encrypt = sdms.ENCRYPT_AVAIL,
                 wait = False, timeout_sec = 0, extension = None,
                 context = None ):
        """
        Put (upload) raw data for a data record

        This method uploads raw data from the specified path to the specified
        data record. The upload involves a Globus transfer, and the path may be
        a full globus path, or a full or relative local file system path (the
        current endpoint will be prepended).

        Parameters
        ----------
        data_id : str
            Data record ID or alias
        path : str
            Globus or local file system path to source file
        encrypt :
            Encrypt mode (none, if avail, force)
        wait : bool, Optional. Default = False
            Set to true to wait until the file transfer is complete.
            Otherwise, and by default, the transfer will take place in the
            background / asynchronously
        timeout_sec : int, Optional. Default = 0
            Timeout in seconds for polling the status of the Globus transfer.
            By default, there is no timeout.
        extension : str, Optional. Default = None
            Override extension of source file.
            By default, the extension is detected automatically.
        context : str, Optional. Default = None
            User ID or project ID to use for alias resolution.

        Returns
        -------
        msg : XfrDataReply Google protobuf message
            Response from DataFed

        Raises
        ------
        Exception : On invalid options or communication / server error.
        """
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

    def dataBatchCreate( self, file, coll_id = None, context = None ):
        """
        Batch create data records

        Create one or more data records from JSON source files that specify all
        metadata for the record. The source files may contain an individual JSON
        object, or an array of JSON objects. There is a maximum limit to the
        amount of data that can be sent in a single batch create request (see
        ``_max_payload_size`` attribute).

        Parameters
        ----------
        file : list or tuple
            An array of (JSON) filenames to process
        coll_id : str, Optional. Default = None
            Parent collection ID/alias . Replaces parent field in JSON.
            By default, the parent field in the JSON file will be used.
        context : str, Optional. Default = None
            User ID or project ID to use for alias resolution.

        Returns
        -------
        msg : RecordDataReply Google protobuf message
            Response from DataFed

        Raises
        ------
        Exception : On invalid options or communication / server error
        """
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

    def dataBatchUpdate( self, file ):
        """
        Batch update data records

        Update one or more data records from JSON source files that specify all
        updated metadata for the record. The source files may contain an
        individual JSON object, or an array of JSON objects. There is a maximum
        limit to the amount of data that can be sent in a single batch create
        request (see _max_payload_size).

        Parameters
        ----------
        file : list or tuple
            An array of filenames on local file system to process

        Returns
        -------
        msg : RecordDataReply Google protobuf message
            Response from DataFed

        Raises
        ------
        Exception : On invalid options or communication / server error
        """
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

    def collectionView( self, coll_id, context = None ):
        """
        View collection information

        View alias, title, and description of a collection

        Parameters
        ----------
        coll_id : str
            ID/alias of Collection to view
        context : str, Optional. Default = None
            User ID or project ID to use for alias resolution.

        Returns
        -------
        msg : CollDataReply Google protobuf message
            Response from DataFed

        Raises
        ------
        Exception : On invalid options or communication / server error.
        """
        msg = anon.CollViewRequest()
        msg.id = self._resolve_id( coll_id, context )
        #msg.id = self._resolve_coll_id( coll_id, context )

        return self._mapi.sendRecv( msg )

    def collectionCreate( self, title, alias = None, description = None,
                          tags = None, topic = None, parent_id = None,
                          context = None ):
        """
        Create a new collection

        Create a new collection with title, alias, and description. Note that if
        topic is provided, the collection and contents become publicly readable
        and will be presented in DataFed catalog browser.

        Parameters
        ----------
        title : str
            Title of collection
        alias : str, Optional. Default = None
            Alias of collection
        description : str, Optional. Default = None
            Text description of collection
        tags : list of str, Optional. Default = None
            Tags that describe the collection
        topic : str
            Scientific topics under which this collection is organized
            in the catalog view.
            If topic is added, the collection and contents become **publicly**
            readable and will be presented in DataFed catalog browser.
        parent_id : str, Optional. Default = "root"
            ID/alias of collection within which to create this collection.
            By default, the collection will be created in the user's root
            collection
        context : str, Optional. Default = None
            User ID or project ID to use for alias resolution.

        Returns
        -------
        msg : CollDataReply Google protobuf message
            Response from DataFed

        Raises
        ------
        Exception : On communication or server error
        """
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

    def collectionUpdate( self, coll_id, title = None, alias = None,
                          description = None, tags = None, topic = None,
                          context = None ):
        """
        Update an existing collection with title, alias, and description.

        Note
        that if topic is added, the collection and contents become publicly
        readable and will be presented in DataFed catalog browser.

        Parameters
        ----------
        coll_id : str
           ID/alias of the collection
        title : str, Optional. Default = None
            Title of collection
        alias : str, Optional. Default = None
            Alias of collection
        description : str, Optional. Default = None
            Text description of collection
        tags : list of str, Optional. Default = None
            Tags that describe the collection
        topic : str
            Scientific topics under which this collection is organized
            in the catalog view.
            If topic is added, the collection and contents become **publicly**
            readable and will be presented in DataFed catalog browser.
        context : str, Optional. Default = None
            User ID or project ID to use for alias resolution.

        Returns
        -------
        msg : CollDataReply Google protobuf message
            Response from DataFed

        Raises
        ------
        Exception : On communication or server error
        """
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

    def collectionDelete( self, coll_id, context = None ):
        """
        Delete one or more existing collections

        Deletes one or more collections and contained items. When a collection is
        deleted, all contained collections are also deleted. However, contained
        data records are only deleted if they are not linked to another
        collection not involved in the deletion.

        Parameters
        ----------
        coll_id : str, or list of str
           ID/alias OR list of IDs/aliases of the collection(s) to be deleted
        context : str, Optional. Default = None
            User ID or project ID to use for alias resolution.

        Returns
        -------
        msg : AckReply Google protobuf message
            Response from DataFed

        Raises
        ------
        Exception : On communication or server error
        """
        msg = auth.CollDeleteRequest()

        if isinstance( coll_id, list ):
            for i in coll_id:
                msg.id.append( self._resolve_id( i, context ))
        else:
            msg.id.append( self._resolve_id( coll_id, context ))

        return self._mapi.sendRecv( msg )

    def collectionItemsList( self, coll_id, offset = 0, count = 20,
                             context = None ):
        """
        List items in collection

        List items linked to or contained in the specified collection.

        Parameters
        ----------
        coll_id : str
           ID/alias of the collection
        offset : int, Optional. Default = 0
            Offset of listing results for paging
        count : int, Optional. Default = 20
            Number (limit) of listing results for (cleaner) paging
        context : str, Optional. Default = None
            User ID or project ID to use for alias resolution.

        Returns
        -------
        ListingReply Google protobuf message
            Response from DataFed

        Raises
        ------
        Exception : On communication or server error
        Exception : On invalid options
        """
        msg = anon.CollReadRequest()
        msg.count = count
        msg.offset = offset
        msg.id = self._resolve_id( coll_id, context )

        return self._mapi.sendRecv( msg )

    def collectionItemsUpdate( self, coll_id, add_ids = None, rem_ids = None,
                               context = None ):
        """
        Update (add/remove) items linked to a specified collection

        Note that data
        records may be linked to any number of collections, but collections can
        only be linked to one parent collection. If a collection is added to a
        new parent collection, it is automatically unlinked from it's current
        parent. An ancestor (parent, grandparent, etc) collection cannot be
        linked to a descendant collection.

        Items removed from a collection that have no other parent collections
        are automatically re-linked to the root collection. The return reply
        of this method contains any such re-linked items.

        Parameters
        ----------
        coll_id : str
           ID/alias of the collection
        add_ids : str or list of str, Optional. Default = None
            ID/alias of record(s) and/or collection(s) to add
        rem_ids : str or list of str, Optional. Default = None
            ID/alias of record(s) and/or collection(s) to remove
        context

        Returns
        -------
        ListingReply Google protobuf message
            Response from DataFed

        Raises
        ------
        Exception : On communication or server error
        Exception : On invalid options
        """
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

    def collectionGetParents( self, coll_id, inclusive = False, context = None ):
        """
        Get parents of specified collection up to the root collection

        Parameters
        ----------
        coll_id : str
           ID/alias of the collection
        inclusive : bool, Optional. Default = False
            Set to True to include starting collection.
            Otherwise, and by default, starting collection is ignored.
        context : str, Optional. Default = None
            User ID or project ID to use for alias resolution.

        Returns
        -------
        CollPathReply Google protobuf message
            Response from DataFed

        Raises
        ------
        Exception : On communication or server error
        Exception : On invalid options
        """
        msg = auth.CollGetParentsRequest()
        msg.id = self._resolve_id( coll_id, context )
        msg.inclusive = inclusive

        return self._mapi.sendRecv( msg )

    # =========================================================================
    # ----------------------------------------------------------- Query Methods
    # =========================================================================

    def queryList( self, offset = 0, count = 20 ):
        """
        List saved queries

        Parameters
        ----------
        offset : int, Optional. Default = 0
            Offset of listing results for paging
        count : int, Optional. Default = 20
            Number (limit) of listing results for (cleaner) paging

        Returns
        -------
        ListingReply Google protobuf message
            Response from DataFed

        Raises
        ------
        Exception : On communication or server error
        Exception : On invalid options
        """
        msg = auth.QueryListRequest()
        msg.offset = offset
        msg.count = count

        return self._mapi.sendRecv( msg )

    def queryView( self, query_id ):
        """
        View a saved query

        Parameters
        ----------
        query_id : str
            ID of saved query to view

        Returns
        -------
        QueryDataReply Google protobuf message

        Raises
        ------
        Exception : On communication or server error
        """
        msg = auth.QueryViewRequest()
        msg.id = query_id

        return self._mapi.sendRecv( msg )

    def queryCreate( self, title, id = None, text = None, meta = None,
                     no_default = None, coll = None, proj = None ):
        """
        Create a new saved query

        Default scope for the search includes owned data and all data
        associated with owned and managed projects, as well as member projects.

        Parameters
        ----------
        title : str
            Title of query
        id : str, Optional. Default = None
            ID/alias for query. Automatically assigned by default.
        text : str, Optional. Default = None
            Description of query
        meta : str, Optional. Default = None
            Query expression
        no_default : bool, Optional. Default = None
            Omit default scopes if True
        coll : str, Optional. Default = None
            ID(s) or alias(es) of collection(s) to add to scope
        proj : str, Optional. Default = None
            ID(s) or alias(es) of project(s) to add to scope

        Returns
        -------
        QueryDataReply Google protobuf message

        Raises
        ------
        Exception : On communication or server error
        Exception : On invalid options
        """
        msg = auth.QueryCreateRequest()
        msg.title = title
        msg.query = self._makeQueryString( id, text, meta, no_default, coll, proj )

        return self._mapi.sendRecv( msg )

    def queryUpdate( self, query_id, title = None, id = None, text = None,
                     meta = None ):
        """
        Update an existing saved query

        Things like the title, and the query expression can be modified.
        However, the scope may not be changed

        Parameters
        ----------
        query_id : str
            ID/alias for query.
        title : str, Optional. Default = None
            Title  of query
        id : str, Optional. Default = None
            ID/alias query
        text : str, Optional. Default = None
            Description of query
        meta : str, Optional. Default = None
            Query expression

        Returns
        -------
        QueryDataReply Google protobuf message

        Raises
        ------
        Exception : On communication or server error
        Exception : On invalid options
        """
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

    def queryDelete( self, query_id ):
        """
        Delete a saved query.

        Parameters
        ----------
        query_id : str
            ID/alias for query.

        Returns
        -------
        AckReply Google protobuf message

        Raises
        ------
        Exception : On communication or server error
        """
        msg = auth.QueryDeleteRequest()
        msg.id.append( query_id )

        return self._mapi.sendRecv( msg )

    def queryExec( self, query_id, offset = 0, count = 20 ):
        """
        Execute a stored query and return matches.

        Parameters
        ----------
        query_id : str
            ID/alias for query.
        offset : int, Optional. Default = 0
            Offset of listing results for paging
        count : int, Optional. Default = 20
            Number (limit) of listing results for (cleaner) paging

        Returns
        -------
        ListingReply Google protobuf message
            Response from DataFed

        Raises
        ------
        Exception : On communication or server error
        Exception : On invalid options
        """
        msg = auth.QueryExecRequest()
        msg.id = query_id
        msg.offset = offset
        msg.count = count

        return self._mapi.sendRecv( msg )

    def queryDirect( self, id = None, text = None, meta = None,
                     no_default = None, coll = None, proj = None,
                     offset = 0, count = 20 ):
        """
        Directly run a manually entered query and return matches

        Parameters
        ----------
        id : str
            ID/alias query text
        text : str, Optional. Default = None
            Description of query
        meta : str, Optional. Default = None
            Query expression
        no_default : bool, Optional. Default = None
            Omit default scopes if True
        coll : str, Optional. Default = None
            ID(s) or alias(es) of collection(s) to add to scope
        proj : str, Optional. Default = None
            ID(s) or alias(es) of project(s) to add to scope
        offset : int, Optional. Default = 0
            Offset of listing results for paging
        count : int, Optional. Default = 20
            Number (limit) of listing results for (cleaner) paging

        Returns
        -------
        ListingReply Google protobuf message
            Response from DataFed

        Raises
        ------
        Exception : On communication or server error
        Exception : On invalid options
        """
        msg = auth.RecordSearchRequest()
        msg.query = self._makeQueryString( id, text, meta, no_default, coll, proj )
        msg.offset = offset
        msg.count = count

        return self._mapi.sendRecv( msg )

    # =========================================================================
    # ------------------------------------------------------------ User Methods
    # =========================================================================

    def userListCollaborators( self, offset = 0, count = 20 ):
        """
        List collaborators. Collaborators are defined as users that have projects
        in common with the current user, or that have data-sharing relationships
        with the current user.

        Parameters
        ----------
        offset : int, Optional. Default = 0
            Offset of listing results for paging
        count : int, Optional. Default = 20
            Number (limit) of listing results for (cleaner) paging

        Returns
        -------
        UserDataReply Google protobuf message

        Raises
        ------
        Exception : On communication or server error
        Exception : On invalid options
        """
        msg = auth.UserListCollabRequest()
        msg.offset = offset
        msg.count = count

        return self._mapi.sendRecv( msg )

    def userListAll( self, offset = 0, count = 20 ):
        """
        List all users

        Parameters
        ----------
        offset : int, Optional. Default = 0
            Offset of listing results for paging
        count : int, Optional. Default = 20
            Number (limit) of listing results for (cleaner) paging

        Returns
        -------
        UserDataReply Google protobuf message

        Raises
        ------
        Exception : On communication or server error
        Exception : On invalid options
        """
        msg = auth.UserListAllRequest()
        msg.offset = offset
        msg.count = count

        return self._mapi.sendRecv( msg )

    def userView( self, uid ):
        """
        View user information

        Parameters
        ----------
        uid : str
            ID of user to view

        Returns
        -------
        UserDataReply Google protobuf message

        Raises
        ------
        Exception : On communication or server error
        Exception : On invalid options
        """
        msg = anon.UserViewRequest()
        msg.uid = uid

        return self._mapi.sendRecv( msg )


    # =========================================================================
    # --------------------------------------------------------- Project Methods
    # =========================================================================

    def projectList( self, owned = True, admin = True, member = True,
                     offset = 0, count = 20 ):
        """
        List projects associated with current user

        List projects that are owned or managed by the current user, as well as
        projects were the current user is a member.

        Parameters
        ----------
        owned : bool, optional. Default = True
            If True, includes owned projects. Otherwise, only includes projects
            owned by others that this user is part of.
        admin : bool, optional. Default = True
            If True, includes projects managed by this user. Otherwise, only
            includes projects managed by others that this user is part of.
        member : bool, optional. Default = True
            If True, includes projects where the current user is a member.
            Otherwise, does not list such projects.
        offset : int, Optional. Default = 0
            Offset of listing results for paging
        count : int, Optional. Default = 20
            Number (limit) of listing results for (cleaner) paging

        Returns
        -------
        ListingReply Google protobuf message
            Response from DataFed

        Raises
        ------
        Exception : On communication or server error
        Exception : On invalid options
        """
        msg = auth.ProjectListRequest()
        msg.as_owner = owned
        msg.as_admin = admin
        msg.as_member = member
        msg.offset = offset
        msg.count = count

        return self._mapi.sendRecv( msg )

    def projectView( self, project_id ):
        """
        View project information (title, description, owner, etc.)

        Parameters
        ----------
        project_id : str
            ID of project to view

        Returns
        -------
        ProjectDataReply Google protobuf message

        Raises
        ------
        Exception : On communication or server error
        Exception : On invalid options
        """
        msg = anon.ProjectViewRequest()
        msg.id = project_id

        return self._mapi.sendRecv( msg )

    def projectGetRole( self, project_id ):
        """
        Get the role that this user plays in a given project

        Parameters
        ----------
        project_id : str
            ID of project to view

        Returns
        -------
        Google protobuf message

        Raises
        ------
        Exception : On communication or server error
        Exception : On invalid options
        """
        msg = auth.ProjectGetRoleRequest()
        msg.id = project_id

        reply = self._mapi.sendRecv( msg )

        return reply[0].role

    # =========================================================================
    # ----------------------------------------------------- Shared Data Methods
    # =========================================================================

    def sharesListOwners( self, inc_users = None, inc_projects = None,
                          subject = None ):
        """
        List users and/or that have shared data with client/subject.

        Parameters
        ----------
        inc_users : list of str, Optional. Default
            Include a list of specified users
        inc_projects : list of str, Optional. Default
            Include a list of specified projects
        subject : list of str, Optional. Default
            Include a list of specified subjects

        Returns
        -------
        ListingReply Google protobuf message

        Raises
        ------
        Exception : On communication or server error
        Exception : On invalid options
        """
        msg = auth.ACLBySubjectRequest()

        if inc_users != None:
            msg.inc_users = inc_users

        if inc_projects != None:
            msg.inc_projects = inc_projects

        if subject != None:
            msg.subject = subject.lower()

        return self._mapi.sendRecv( msg )

    '''
    def sharedUsersList( self ):
        """
        List users who have shared data the with current user
        
        Users that the current user has shared data with are not listed.
        
        Returns
        -------
        UserDataReply Google protobuf message
            Response from DataFed
        
        Raises
        ------
        Exception : On communication or server error
        Exception : On invalid options
        """
        msg = auth.ACLByUserRequest()

        return self._mapi.sendRecv( msg )

    def sharedProjectsList( self ):
        """
        List projects that have shared data with the current user
        
        Returns
        -------
        ProjectDataReply Google protobuf message
            Response from DataFed
            
        Raises
        ------
        Exception : On communication or server error
        Exception : On invalid options
        """
        msg = auth.ACLByProjRequest()

        return self._mapi.sendRecv( msg )
    '''

    def sharesListItems( self, owner_id, context = None,
                         offset = None, count = None ):
        """
        List shared data records and collections by user/project ID

        Parameters
        ----------
        owner_id : str
            User or project ID
        context : str, Optional. Default = None
            User ID or project ID to use for alias resolution.
        offset : int, Optional. Default = 0
            Offset of listing results for paging
        count : int, Optional. Default = 20
            Number (limit) of listing results for (cleaner) paging

        Returns
        -------
        ListingReply Google protobuf message
            Response from DataFed

        Raises
        ------
        Exception : On communication or server error
        Exception : On invalid options
        """
        # TODO add support for offset & count

        msg = auth.ACLListItemsBySubjectRequest()
        msg.owner = owner_id.lower()
        if context != None:
            msg.subject = context.lower()

        return self._mapi.sendRecv( msg )


    # =========================================================================
    # --------------------------------------------------- Data Transfer Methods
    # =========================================================================

    def taskList( self, time_from = None, time_to = None, since = None,
                  status = None, offset = 0, count = 20 ):
        """
        List recent Globus data transfer tasks

        If no time or status filter options are provided, all Globus transfers
        initiated by the current user are listed, arranged by
        most recent first. Note that the DataFed server periodically purges
        transfer history such that only up to 30 days of history are retained.

        Parameters
        ----------
        time_from : str, Optional. Default = None
            Start date/time for listing specified as M/D/YYYY[,HH:MM]
        time_to : str, Optional. Default = None
            End date/time for listing specified as M/D/YYYY[,HH:MM]
        since: str, Optional. Default = None
            List from specified time string (second default, suffix
            h = hours, d = days, w = weeks)
        status : list of str and/or int. Default = None
        offset : int, Optional. Default = 0
            Offset of matching results for paging
        count : int, Optional. Default = 20
            Number (limit) of matching results for (cleaner) paging

        Returns
        -------
        XfrDataReply Google protobuf message
            Response from DataFed

        Raises
        ------
        Exception : On communication or server error
        Exception : On invalid options
        """
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
                if isinstance(s, str):
                    stat = s.lower()
                elif isinstance(s, int):
                    stat = str(s)
                else:
                    # raise TypeError('status should be a list of str or int')
                    stat = str(s)
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

    def taskView( self, task_id = None ):
        """
        View information regarding a (Globus data transfer) task


        Parameters
        ----------
        task_id : str, Optional. Default = None
            Task ID to view.
            If specified, information regarding the requested task is returned.
            Otherwise and by default, information regarding the latest task
            initiated by the current user is returned.

        Returns
        -------
        TaskDataReply Google protobuf message
            Response from DataFed

        Raises
        ------
        Exception : On communication or server error
        Exception : On invalid options
        """
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

    def endpointListRecent( self ):
        """
        List recently used Globus endpoints

        Returns
        -------
        UserGetRecentEPReply Google protobuf message
            Response from DataFed

        Raises
        ------
        Exception : On communication or server error
        """
        msg = auth.UserGetRecentEPRequest()

        return self._mapi.sendRecv( msg )

    def endpointDefaultGet( self ):
        """
        Get configured default endpoint

        Returns
        -------
        str
            default endpoint string, or None if not configured
        """
        return self.cfg.get( "default_ep" )

    def endpointDefaultSet( self, endpoint ):
        """
        Set the default Globus endpoint (used to set initial current endpoint)

        Parameters
        ----------
        endpoint : str
            New default endpoint
        """
        # TODO validate ep is UUID or legacy (not an ID)
        self.cfg.set( "default_ep", endpoint, True )
        if not self._cur_ep:
            self._cur_ep = endpoint

    def endpointGet( self ):
        """
        Get current Globus endpoint

        Returns
        -------
        str
            current endpoint string, or None if not set
        """
        # TODO: Consider making self._cur_ep more private via self.__cur_ep
        return self._cur_ep

    def endpointSet( self, endpoint ):
        """
        Set current Globus endpoint (added to partial get/put paths)

        Parameters
        ----------
        endpoint : str
            New current Globus endpoint
        """
        # TODO validate ep is UUID or legacy (not an ID)
        self._cur_ep = endpoint


    # =========================================================================
    # --------------------------------------------------- Miscellaneous Methods
    # =========================================================================

    def setupCredentials( self ):
        """
        Setup local credentials

        This command installs DataFed credentials for the current user in the
        configured client configuration directory. Subsequent use of the
        DataFed API will read these credentials instead of requiring manual
        authentication.

        Returns
        -------
        None

        Raises
        ------
        Exception : On communication or server error
        Exception : On invalid options
        """
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

    def setContext( self, item_id = None ):
        """
        Set current context which is used to resolve relative aliases

        Parameters
        ----------
        item_id : str, optional. Default = None
            A user or project ID. By default, this user's ID will be used as
            the context

        Returns
        -------
        None

        Raises
        ------
        Exception : On communication or server error
        Exception : On invalid options
        """
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

    def getContext( self ):
        """
        Gets the current context which is used to resolve relative aliases

        Returns
        -------
        str
            The current user or project ID context string
        """
        return self._cur_sel

    def timestampToStr( self, ts ):
        """
        Convert timestamp into standard string format

        Parameters
        ----------
        ts : time.struct_time
            Timestamp in local time

        Returns
        -------
        str
            A string representation of the timestamp in local time
        """
        return time.strftime("%m/%d/%Y,%H:%M", time.localtime( ts ))

    def strToTimestamp( self, time_str ):
        """
        Convert a date/time string into the integer value of the
        represented timestamp (in local time)

        Parameters
        ----------
        time_str : str
            Date/time in %m/%d/%Y[,%H:%M[:%S]] format

        Returns
        -------
        int
            The integer timestamp representation of the time string
        """
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

    def sizeToStr( self, size, precision = 1 ):
        """
        Convert integer size of data sizes to human readable size string with
        metric units

        Parameters
        ----------
        size : int
            size of data file
        precision : int, optional. defaut = 1
            Precision of converted value

        Returns
        -------
        str
            The size as a string with byte units
        """
        if not isinstance(size, int):
            raise TypeError('size must be a integer')
        if size == 0:
            return "0"
        elif size < 1024:
            return str(size) + " B"
        elif size < 1048576:
            denom = 1024  # 2 ** 10
            unit = "KB"
        elif size < 1073741824:
            denom = 1048576  # 2 ** 20
            unit = "MB"
        elif size < 1099511627776:
            denom = 1073741824  # 2 ** 30
            unit = "GB"
        else:
            denom = 1099511627776
            unit = "TB"

        return "{:.{}f} {}".format( size/denom, precision, unit )

    # =========================================================================
    # --------------------------------------------------------- Private Methods
    # =========================================================================

    def _makeQueryString( self, id, text, meta, no_default, coll, proj ):
        """
        Compose query parameters into a query string

        Parameters
        ----------
        id : str
            portion of ID or alias of data of interest
        text : str
            plain text to search
        meta : str
            metadata search query in AQL format
        no_default : bool
            Whether or not to use default values
        coll : list of str
            IDs or aliases of the collections to search over
        proj : list of str
            IDs or aliases of the projects to search over

        Returns
        -------
        str
            Final search query
        """
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

    def _uniquifyFilename( self, path ):
        """
        Ensures that the provided file name is unique by generating a new
        unique file name if the specified file name already exists.

        Parameters
        ----------
        path : str or Pathlib path
            path to file of interest

        Returns
        -------
        str
            Unique file path
        """
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
        """
        Resolve relative local path

        Parameters
        ----------
        path : str
            User specified relative path

        Returns
        -------
        str
            Path ready for HTTP
        """
        if path[0] == "~":
            res = pathlib.Path(path).expanduser().resolve()
        elif path[0] == "." or path[0] != '/':
            res = pathlib.Path.cwd() / path
            res = res.resolve()
        else:
            res = path

        return str(res)

    def _resolvePathForGlobus( self, path, must_exist ):
        """
        Resolve relative paths and prefix with current endpoint if needed

        Parameters
        ----------
        path : str
            file path
        must_exist : bool
            Whether or not the path must exist

        Returns
        -------
        str
            Path with globus endpoint UUID or alias prefixed.
        """
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
                    _path = str(winp)
                elif not winp.drive:
                    _path = winp.as_posix()
                    if _path[0] != '/':
                        _path = "/" + _path
            else:
                _path = str(_path)

        return self._cur_ep + _path

    def _resolve_id( self, item_id, context = None ):
        """
        Resolve ID by prefixing relative aliases with current or specifies
        context

        Parameters
        ----------
        item_id : str
            ID of record, project, user or collection
        context : str, Optional. Default = None
            User ID or project ID to use for alias resolution.

        Returns
        -------
        str
            resolved ID
        """
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

    def _setSaneDefaultOptions( self ):
        """
        Set any missing config options to sane defaults

        Returns
        -------
        opts : dict
            Automatically determined save configuration options
        """
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

