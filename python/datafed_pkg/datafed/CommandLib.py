# @package datafed.CommandLib
# Provides a high-level client interface to the DataFed server
#
# The DataFed CommandLib module contains a single API class that provides
# a high-level client interface for interacting with a DataFed server. This
# module relies on the DataFed MessageLib and Connection modules  for lower-
# level communication support.

from __future__ import division, print_function, absolute_import
import os
import datetime
import re
import json as jsonlib
import time
import pathlib
import requests
from . import SDMS_Auth_pb2 as auth
from . import SDMS_pb2 as sdms
from . import MessageLib
from . import Config


class API:
    """
    A high-level messaging interface to the DataFed core server

    The DataFed CommandLib.API class provides a high-level interface
    for sending requests to a DataFed server. Requests are sent via python
    class methods and replies are (currently) returned as Google Protobuf message objects.
    These reply messages are defined in the \\*.proto files included in the
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
    _endpoint_legacy = re.compile(r"[\w\-]+#[\w\-]+")
    _endpoint_uuid = re.compile(
        r"[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}", re.I
    )

    def __init__(self, opts={}):
        if not isinstance(opts, dict):
            raise Exception("CommandLib API options parameter must be a dictionary.")

        self._uid = None
        self._cur_sel = None
        self._cur_ep = None
        self._cur_alias_prefix = ""

        self.cfg = Config.API(opts)
        _opts = self._setSaneDefaultOptions()

        self._mapi = MessageLib.API(**_opts)
        self._mapi.setNackExceptionEnabled(True)
        auth, uid = self._mapi.getAuthStatus()

        if auth:
            self._uid = uid
            self._cur_sel = uid

        self._cur_ep = self.cfg.get("default_ep")

    # =========================================================================
    # -------------------------------------------------- Authentication Methods
    # =========================================================================

    def getAuthUser(self):
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

    def logout(self):
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

    def loginByPassword(self, uid, password):
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

        self._mapi.manualAuthByPassword(uid, password)

        self._uid = self._mapi._uid
        self._cur_sel = self._mapi._uid

    def generateCredentials(self):
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

        return self._mapi.sendRecv(msg)

    # =========================================================================
    # ------------------------------------------------------------ Repo Methods
    # =========================================================================

    def repoCreate(
        self,
        repo_id,
        title=None,
        desc=None,
        domain=None,
        capacity=None,
        pub_key=None,
        address=None,
        endpoint=None,
        path=None,
        exp_path=None,
        admins=[],
    ):
        """
        Create a repository


        Parameters
        ----------
        repo_id : str
            The id of the data repository i.e. "datafed-home" internally this
            will be represented as "repo/datafed-home"
        title : str
            A title describing the repository
        desc : str
            A detailed description of the repository
        domain : str
            May not be needed, used by FUSE
        capacity : str
            The size of the repository in bytes
        pub_key : str
            The public key of the repo so the core server and repository server can communicate
        address : str
            The tcp address of the repository server, given the domain and the
            port i.e. "tcp://my-repo-server.cu.edu:9000"
        endpoint : str
            The globus UUID associated with the repository with the following
            format "XXXXYYYYXXXX-XXXX-XXXX-XXXX-XXXXYYYY"
        path : str
            The relative POSIX path as seen from the globus collection
            (endpoint) to the repositories folder which is controled by the
            datafed repo server. i.e. if I have a POSIX path
            /home/tony_stark/inventions/datafed-home and the endpoint path
            pointed to /home/tony_stark/inventions then the POSIX path could be
            set to /datafed-home, NOTE the last folder in the path must have
            the same name as the repo_id.
        exp_path : str
        admins : list[str]
            A list of DataFed users that will have repository admin rights on
            the repository. i.e. ["u/tony_stark", "u/pepper"]

        Returns
        -------
        msg : RepoDataReply Google protobuf message response from DataFed

        Raises
        ------
        Exception : On communication or server error
        """
        msg = auth.RepoCreateRequest()
        msg.id = repo_id
        msg.title = title
        msg.desc = desc
        msg.domain = domain
        msg.exp_path = exp_path
        msg.address = address
        msg.endpoint = endpoint
        msg.pub_key = pub_key
        msg.path = path
        msg.capacity = capacity

        if isinstance(admins, list):
            for admin in admins:
                msg.admin.append(admin)

        return self._mapi.sendRecv(msg)

    def repoList(self, list_all: bool = False):
        """
        List all repositories

        By default will only list the repos associated with the user.
        """
        msg = auth.RepoListRequest()
        msg.all = list_all
        return self._mapi.sendRecv(msg)

    def repoDelete(self, repo_id):
        """
        Delete a repository

        Parameters
        ----------
        repo_id : str
            The id of the data repository

        Returns
        -------
        msg : AckReply

        Raises
        ------
        Exception : On communication or server error
        """
        msg = auth.RepoDeleteRequest()
        msg.id = repo_id
        return self._mapi.sendRecv(msg)

    def repoAllocationCreate(self, repo_id, subject, data_limit, rec_limit):
        if not repo_id.startswith("repo/"):
            repo_id = "repo/" + repo_id

        msg = auth.RepoAllocationCreateRequest()
        msg.repo = repo_id
        msg.subject = subject
        msg.data_limit = data_limit
        msg.rec_limit = rec_limit
        return self._mapi.sendRecv(msg)

    def repoListAllocations(self, repo_id):
        if not repo_id.startswith("repo/"):
            repo_id = "repo/" + repo_id

        msg = auth.RepoListAllocationsRequest()
        msg.id = repo_id
        return self._mapi.sendRecv(msg)

    def repoAllocationDelete(self, repo_id, subject):
        if not repo_id.startswith("repo/"):
            repo_id = "repo/" + repo_id
        msg = auth.RepoAllocationDeleteRequest()
        msg.repo = repo_id
        msg.subject = subject
        return self._mapi.sendRecv(msg)

    # =========================================================================
    # ------------------------------------------------------------ Data Methods
    # =========================================================================

    def dataView(self, data_id, details=False, context=None):
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
        msg = auth.RecordViewRequest()
        msg.id = self._resolve_id(data_id, context)
        msg.details = details

        return self._mapi.sendRecv(msg)

    def dataCreate(
        self,
        title,
        alias=None,
        description=None,
        tags=None,
        extension=None,
        metadata=None,
        metadata_file=None,
        schema=None,
        schema_enforce=None,
        parent_id="root",
        deps=None,
        repo_id=None,
        raw_data_file=None,
        external=None,
        context=None,
    ):
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
        schema: str, Optional. Default = None
            Set schema ID:ver for metadata validation
        schema_enforce: bool, Optional, Default = None
            Set to true to enforce metadata schema validation (i.e. fail if does not comply).
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
        raw_data_file : str, Optional. Default = None
            Raw data file as a full Globus path. Currently, this parameter can only
            be specified with the external flag set to true.
        external : bool, Optional. Default = None
            Set to true to specify raw data for this record is external (unmanaged).
            Cannot be specified with repo_id.
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

        if repo_id and external:
            raise Exception("Cannot specify repository for external (unmanaged) data.")

        if raw_data_file and not external:
            raise Exception(
                "Cannot specify raw_data_file for managed data (must upload after record creation)."
            )

        if metadata and metadata_file:
            raise Exception("Cannot specify both metadata and metadata-file options.")

        msg = auth.RecordCreateRequest()
        msg.title = title
        msg.parent_id = self._resolve_id(parent_id, context)

        if alias:
            msg.alias = alias

        if description:
            msg.desc = description

        if tags:
            msg.tags.extend(tags)

        if repo_id:
            msg.repo_id = repo_id

        if external:
            msg.external = external

        if raw_data_file:
            msg.source = raw_data_file

        if extension:
            msg.ext = extension
            msg.ext_auto = False

        if metadata_file:
            try:
                f = open(metadata_file, "r")
                metadata = f.read()
                f.close()
            except BaseException:
                raise Exception(
                    "Could not open metadata file: {}".format(metadata_file)
                )

        if metadata:
            msg.metadata = metadata

        if schema:
            msg.sch_id = schema

        if schema_enforce:
            msg.sch_enforce = schema_enforce

        if deps:
            for d in deps:
                dp = msg.deps.add()
                if d[0] == "der":
                    dp.type = 0
                elif d[0] == "comp":
                    dp.type = 1
                elif d[0] == "ver":
                    dp.type = 2
                dp.id = self._resolve_id(d[1], context)

        return self._mapi.sendRecv(msg)

    def dataUpdate(
        self,
        data_id,
        title=None,
        alias=None,
        description=None,
        tags=None,
        extension=None,
        metadata=None,
        metadata_file=None,
        metadata_set=False,
        schema=None,
        schema_enforce=None,
        deps_add=None,
        deps_rem=None,
        raw_data_file=None,
        context=None,
    ):
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
        schema: str, Optional. Default = None
            Set schema ID:ver for metadata validation
        schema_enforce: bool, Optional, Default = None
            Set to true to enforce metadata schema validation (i.e. fail if does not comply).
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
        raw_data_file : str, Optional. Default = None
            Raw data file as a full Globus path. Currently, this parameter can only
            be specified for records with the external (unmanaged) raw data.
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
            raise Exception("Cannot specify both metadata and metadata-file options.")

        msg = auth.RecordUpdateRequest()
        msg.id = self._resolve_id(data_id, context)

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
                msg.tags.extend(tags)

        if extension is not None:
            if extension:
                msg.ext = extension
                msg.ext_auto = False
            else:
                msg.ext_auto = True

        if raw_data_file:
            msg.source = raw_data_file

        if metadata_file:
            try:
                f = open(metadata_file, "r")
                metadata = f.read()
                f.close()
            except BaseException:
                raise Exception(
                    "Could not open metadata file: {}".format(metadata_file)
                )

        if metadata is not None:
            msg.metadata = metadata

        if metadata_set:
            msg.mdset = True

        if schema is not None:
            msg.sch_id = schema

        if schema_enforce:
            msg.sch_enforce = schema_enforce

        if deps_add:
            for d in deps_add:
                dep = msg.dep_add.add()
                if d[0] == "der":
                    dep.type = 0
                elif d[0] == "comp":
                    dep.type = 1
                elif d[0] == "ver":
                    dep.type = 2
                dep.id = self._resolve_id(d[1], context)

        if deps_rem:
            for d in deps_rem:
                dep = msg.dep_rem.add()
                if d[0] == "der":
                    dep.type = 0
                elif d[0] == "comp":
                    dep.type = 1
                elif d[0] == "ver":
                    dep.type = 2
                dep.id = self._resolve_id(d[1], context)

        return self._mapi.sendRecv(msg)

    def dataDelete(self, data_id, context=None):
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

        if isinstance(data_id, list):
            for i in data_id:
                msg.id.append(self._resolve_id(i, context))
        else:
            msg.id.append(self._resolve_id(data_id, context))

        return self._mapi.sendRecv(msg)

    def dataGet(
        self,
        item_id,
        path,
        encrypt=sdms.ENCRYPT_AVAIL,
        orig_fname=False,
        wait=False,
        timeout_sec=0,
        context=None,
    ):
        """
        Get (download) raw data for one or more data records and/or collections

        This method downloads to the specified path the raw data associated with
        a specified data record, or the records contained in a collection, or
        with a list of records and/or collections. The path may be a full
        globus path or a full or relative local file system path (will prepend
        the default endpoint). If the endpoint is not local, only full paths
        should be specified.

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

        if isinstance(item_id, str):
            item_id = [item_id]

        for ids in item_id:
            msg.id.append(self._resolve_id(ids, context))

        reply = self._mapi.sendRecv(msg)

        # May initiate multiple transfers - one per repo with multiple records per transfer
        # Downloads may be Globus OR HTTP, but not both

        glob_ids = []

        for i in reply[0].item:
            glob_ids.append(i.id)

        if len(glob_ids) > 0:
            # Globus transfers
            msg = auth.DataGetRequest()
            msg.id.extend(glob_ids)
            msg.path = self._resolvePathForGlobus(path, False)
            msg.encrypt = encrypt
            msg.orig_fname = orig_fname

            reply = self._mapi.sendRecv(msg)

            if reply[0].task and wait:
                msg2 = auth.TaskViewRequest()
                msg2.task_id = reply[0].task.id
                elapsed = 0

                while True:
                    time.sleep(4)
                    elapsed = elapsed + 4

                    reply2 = self._mapi.sendRecv(msg2, nack_except=False)

                    # timeout
                    if reply2[0] is None:
                        break

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

    def dataPut(
        self,
        data_id,
        path,
        encrypt=sdms.ENCRYPT_AVAIL,
        wait=False,
        timeout_sec=0,
        extension=None,
        context=None,
    ):
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
        msg.id = self._resolve_id(data_id, context)
        msg.path = self._resolvePathForGlobus(path, False)
        msg.encrypt = encrypt
        if extension:
            msg.ext = extension

        reply = self._mapi.sendRecv(msg)

        if (reply[0].HasField("task")) and wait:
            msg2 = auth.TaskViewRequest()
            msg2.task_id = reply[0].task.id
            elapsed = 0

            while True:
                time.sleep(4)
                elapsed = elapsed + 4

                reply2 = self._mapi.sendRecv(msg2, nack_except=False)

                # Not sure if this can happen:
                if reply2[1] == "NackReply":
                    break

                # reply = reply2

                if reply2[0].task[0].status > 2:
                    break

                if timeout_sec and elapsed > timeout_sec:
                    break

            reply = reply2

        return reply

    def dataBatchCreate(self, file, coll_id=None, context=None):
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
                raise Exception("File not found: " + f)

            tot_size += fp.stat().st_size
            if tot_size > API._max_payload_size:
                raise Exception(
                    "Total batch create size exceeds limit ({})".format(
                        API._max_payload_size
                    )
                )

            with fp.open("r+") as f:
                records = jsonlib.load(f)

                if not isinstance(records, list):
                    records = [records]

                if coll_id:
                    coll = self._resolve_id(coll_id, context)
                    for item in records:
                        item["parent"] = coll

                payload.extend(records)

        msg = auth.RecordCreateBatchRequest()
        msg.records = jsonlib.dumps(payload)

        return self._mapi.sendRecv(msg)

    def dataBatchUpdate(self, file):
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
                raise Exception("File not found: " + f)

            tot_size += fp.stat().st_size
            if tot_size > API._max_payload_size:
                raise Exception(
                    "Total batch update size exceeds limit ({})".format(
                        API._max_payload_size
                    )
                )

            with fp.open("r+") as f:
                records = jsonlib.load(f)

                if not isinstance(records, list):
                    payload.append(records)
                else:
                    payload.extend(records)

        msg = auth.RecordUpdateBatchRequest()
        msg.records = jsonlib.dumps(payload)

        return self._mapi.sendRecv(msg)

    # =========================================================================
    # ------------------------------------------------------ Collection Methods
    # =========================================================================

    def collectionView(self, coll_id, context=None):
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
        msg = auth.CollViewRequest()
        msg.id = self._resolve_id(coll_id, context)
        # msg.id = self._resolve_coll_id( coll_id, context )

        return self._mapi.sendRecv(msg)

    def collectionCreate(
        self,
        title,
        alias=None,
        description=None,
        tags=None,
        topic=None,
        parent_id="root",
        context=None,
    ):
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
            msg.tags.extend(tags)

        if topic:
            msg.topic = topic

        if parent_id:
            msg.parent_id = self._resolve_id(parent_id, context)

        return self._mapi.sendRecv(msg)

    def collectionUpdate(
        self,
        coll_id,
        title=None,
        alias=None,
        description=None,
        tags=None,
        topic=None,
        context=None,
    ):
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
        msg.id = self._resolve_id(coll_id, context)

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
                msg.tags.extend(tags)

        if topic is not None:
            msg.topic = topic

        return self._mapi.sendRecv(msg)

    def collectionDelete(self, coll_id, context=None):
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

        if isinstance(coll_id, list):
            for i in coll_id:
                msg.id.append(self._resolve_id(i, context))
        else:
            msg.id.append(self._resolve_id(coll_id, context))

        return self._mapi.sendRecv(msg)

    def collectionItemsList(self, coll_id, offset=0, count=20, context=None):
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
        msg = auth.CollReadRequest()
        msg.count = count
        msg.offset = offset
        msg.id = self._resolve_id(coll_id, context)

        return self._mapi.sendRecv(msg)

    def collectionItemsUpdate(self, coll_id, add_ids=None, rem_ids=None, context=None):
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
        msg.id = self._resolve_id(coll_id, context)

        if isinstance(add_ids, list):
            for i in add_ids:
                msg.add.append(self._resolve_id(i, context))
        elif isinstance(add_ids, str):
            msg.add.append(self._resolve_id(add_ids, context))

        if isinstance(rem_ids, list):
            for i in rem_ids:
                msg.rem.append(self._resolve_id(i, context))
        elif isinstance(rem_ids, str):
            msg.rem.append(self._resolve_id(rem_ids, context))

        return self._mapi.sendRecv(msg)

    def collectionGetParents(self, coll_id, inclusive=False, context=None):
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
        msg.id = self._resolve_id(coll_id, context)
        msg.inclusive = inclusive

        return self._mapi.sendRecv(msg)

    # =========================================================================
    # ----------------------------------------------------------- Query Methods
    # =========================================================================

    def queryList(self, offset=0, count=20):
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

        return self._mapi.sendRecv(msg)

    def queryView(self, query_id):
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

        return self._mapi.sendRecv(msg)

    def queryCreate(
        self,
        title,
        coll_mode=None,
        coll=None,
        id=None,
        text=None,
        tags=None,
        schema=None,
        meta=None,
        meta_err=None,
        owner=None,
        creator=None,
        time_from=None,
        time_to=None,
        public=None,
        category=None,
        sort=None,
        sort_rev=None,
    ):
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
            Text in title or description of query
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
        msg = auth.QueryCreateRequest()
        msg.title = title

        self._buildSearchRequest(
            msg.query,
            coll_mode,
            coll,
            id,
            text,
            tags,
            schema,
            meta,
            meta_err,
            owner,
            creator,
            time_from,
            time_to,
            public,
            category,
            sort,
            sort_rev,
        )

        return self._mapi.sendRecv(msg)

    def queryUpdate(
        self,
        query_id,
        title=None,
        coll_mode=None,
        coll=None,
        id=None,
        text=None,
        tags=None,
        schema=None,
        meta=None,
        meta_err=None,
        owner=None,
        creator=None,
        time_from=None,
        time_to=None,
        public=None,
        category=None,
        sort=None,
        sort_rev=None,
    ):
        """
        Update an existing saved query

        Things like the title, and the query expression can be modified.
        However, the scope may not be changed

        Parameters
        ----------

        Returns
        -------
        QueryDataReply Google protobuf message

        Raises
        ------
        Exception : On communication or server error
        Exception : On invalid options
        """

        msg = auth.QueryUpdateRequest()
        msg.id = query_id

        if title is not None:
            msg.title = title

        self._buildSearchRequest(
            msg.query,
            coll_mode,
            coll,
            id,
            text,
            tags,
            schema,
            meta,
            meta_err,
            owner,
            creator,
            time_from,
            time_to,
            public,
            category,
            sort,
            sort_rev,
        )

        return self._mapi.sendRecv(msg)

    def queryDelete(self, query_id):
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
        msg.id.append(query_id)

        return self._mapi.sendRecv(msg)

    def queryExec(self, query_id, offset=0, count=20):
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

        return self._mapi.sendRecv(msg)

    def queryDirect(
        self,
        coll_mode=None,
        coll=None,
        id=None,
        text=None,
        tags=None,
        schema=None,
        meta=None,
        meta_err=None,
        owner=None,
        creator=None,
        time_from=None,
        time_to=None,
        public=None,
        category=None,
        sort=None,
        sort_rev=None,
        offset=0,
        count=20,
    ):
        """
        Directly run a manually entered query and return matches

        Parameters
        ----------
        coll : str, Optional. Default = None
            ID(s) or alias(es) of collection(s) to add to scope
        id : str
            ID/alias query text
        text : str, Optional. Default = None
            Description of query
        meta : str, Optional. Default = None
            Query expression

        Returns
        -------
        ListingReply Google protobuf message
            Response from DataFed

        Raises
        ------
        Exception : On communication or server error
        Exception : On invalid options
        """
        msg = auth.SearchRequest()

        self._buildSearchRequest(
            msg,
            coll_mode,
            coll,
            id,
            text,
            tags,
            schema,
            meta,
            meta_err,
            owner,
            creator,
            time_from,
            time_to,
            public,
            category,
            sort,
            sort_rev,
            offset,
            count,
        )

        return self._mapi.sendRecv(msg)

    def _buildSearchRequest(
        self,
        msg,
        coll_mode=None,
        coll=None,
        id=None,
        text=None,
        tags=None,
        schema=None,
        meta=None,
        meta_err=None,
        owner=None,
        creator=None,
        time_from=None,
        time_to=None,
        public=None,
        category=None,
        sort=None,
        sort_rev=None,
        offset=0,
        count=20,
    ):

        if coll_mode and (schema is not None or meta is not None or meta_err):
            raise Exception(
                "Cannot specify metadata terms when searching for collection."
            )

        if coll_mode:
            msg.mode = 1
        else:
            msg.mode = 0

        # if category != None and not public:
        #    raise Exception("Category search option is only available for public searches.")

        if coll is not None:
            msg.coll.extend(coll)

        if sort is not None:
            if sort == "id":
                msg.sort = 0
            elif sort == "title":
                msg.sort = 1
            elif sort == "owner":
                msg.sort = 2
            elif sort == "ct":
                msg.sort = 3
            elif sort == "ut":
                msg.sort = 4
            elif sort == "text":
                msg.sort = 5
            else:
                raise Exception("Invalid sort option.")

        if sort_rev:
            if msg.sort == 5:
                raise Exception(
                    "Reverse sort option not available for text-relevance sorting."
                )

            msg.sort_rev = True

        if id is not None:
            msg.id = id

        if text is not None:
            msg.text = text

        if tags is not None:
            msg.tags.extend(tags)

        if owner is not None:
            msg.owner = owner

        if creator is not None:
            msg.creator = creator

        if schema is not None:
            msg.sch_id = schema

        if meta is not None:
            msg.meta = meta

        if meta_err:
            msg.meta_err = True

        if time_from is not None:
            ts = self.strToTimestamp(time_from)
            if ts is None:
                raise Exception("Invalid time format for 'from' option.")

            setattr(msg, "from", ts)

        if time_to is not None:
            ts = self.strToTimestamp(time_to)
            if ts is None:
                raise Exception("Invalid time format for 'from' option.")
            msg.to = ts

        if public:
            msg.published = True

        if category is not None:
            msg.cat_tags.extend(category.split("."))

        if offset is not None:
            msg.offset = offset

        if count is not None:
            msg.count = count

    # =========================================================================
    # ------------------------------------------------------------ User Methods
    # =========================================================================

    def userListCollaborators(self, offset=0, count=20):
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

        return self._mapi.sendRecv(msg)

    def userListAll(self, offset=0, count=20):
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

        return self._mapi.sendRecv(msg)

    def userView(self, uid):
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
        msg = auth.UserViewRequest()
        msg.uid = uid

        return self._mapi.sendRecv(msg)

    # =========================================================================
    # --------------------------------------------------------- Project Methods
    # =========================================================================

    def projectList(self, owned=True, admin=True, member=True, offset=0, count=20):
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

        return self._mapi.sendRecv(msg)

    def projectView(self, project_id):
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
        msg = auth.ProjectViewRequest()
        msg.id = project_id

        return self._mapi.sendRecv(msg)

    def projectGetRole(self, project_id):
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

        reply = self._mapi.sendRecv(msg)

        return reply[0].role

    # =========================================================================
    # ----------------------------------------------------- Shared Data Methods
    # =========================================================================

    def sharedList(self, inc_users=None, inc_projects=None, subject=None):
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
        msg = auth.ACLSharedListRequest()

        if inc_users is not None:
            msg.inc_users = inc_users

        if inc_projects is not None:
            msg.inc_projects = inc_projects

        if subject is not None:
            msg.subject = subject.lower()

        return self._mapi.sendRecv(msg)

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

    def sharedListItems(self, owner_id, context=None, offset=None, count=None):
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

        msg = auth.ACLSharedListItemsRequest()
        msg.owner = owner_id.lower()
        if context is not None:
            msg.subject = context.lower()

        return self._mapi.sendRecv(msg)

    # =========================================================================
    # --------------------------------------------------- Data Transfer Methods
    # =========================================================================

    def taskList(
        self, time_from=None, time_to=None, since=None, status=None, offset=0, count=20
    ):
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
        if since is not None and (time_from is not None or time_to is not None):
            raise Exception("Cannot specify 'since' and 'from'/'to' ranges.")

        msg = auth.TaskListRequest()

        if time_from is not None:
            ts = self.strToTimestamp(time_from)
            if ts is None:
                raise Exception("Invalid time format for 'from' option.")

            setattr(msg, "from", ts)

        if time_to is not None:
            ts = self.strToTimestamp(time_to)
            if ts is None:
                raise Exception("Invalid time format for 'time_to' option.")

            msg.to = ts

        if since is not None:
            try:
                suf = since[-1]
                mod = 1

                if suf == "h":
                    val = int(since[:-1])
                    mod = 3600
                elif suf == "d":
                    val = int(since[:-1])
                    mod = 24 * 3600
                elif suf == "w":
                    val = int(since[:-1])
                    mod = 7 * 24 * 3600
                else:
                    val = int(since)

                if val is None:
                    raise Exception("Invalid value for 'since'")

                msg.since = val * mod
            except BaseException:
                raise Exception("Invalid value for 'since'")

        if status is not None:
            for s in status:
                if isinstance(s, str):
                    stat = s.lower()
                elif isinstance(s, int):
                    stat = str(s)
                else:
                    # raise TypeError('status should be a list of str or int')
                    stat = str(s)
                if stat in ["0", "1", "2", "3", "4"]:
                    msg.status.append(int(stat))
                elif stat == "queued":
                    msg.status.append(0)
                elif stat == "ready":
                    msg.status.append(1)
                elif stat == "running":
                    msg.status.append(2)
                elif stat == "succeeded":
                    msg.status.append(3)
                elif stat == "failed":
                    msg.status.append(4)

        if offset is not None:
            try:
                int(offset)
            except BaseException:
                raise Exception("Invalid offset value.")

            if offset >= 0:
                msg.offset = offset
            else:
                raise Exception("Invalid offset value.")

        if count is not None:
            try:
                int(count)
            except BaseException:
                raise Exception("Invalid count value.")

            if count > 0:
                msg.count = count
            else:
                raise Exception("Invalid count value.")

        return self._mapi.sendRecv(msg)

    def taskView(self, task_id=None):
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

            reply = self._mapi.sendRecv(msg)
        else:
            msg = auth.TaskListRequest()
            msg.offset = 0
            msg.count = 1

            reply = self._mapi.sendRecv(msg)

        return reply

    # =========================================================================
    # -------------------------------------------------------- Endpoint Methods
    # =========================================================================

    def endpointListRecent(self):
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

        return self._mapi.sendRecv(msg)

    def endpointDefaultGet(self):
        """
        Get configured default endpoint

        Returns
        -------
        str
            default endpoint string, or None if not configured
        """
        return self.cfg.get("default_ep")

    def endpointDefaultSet(self, endpoint):
        """
        Set the default Globus endpoint (used to set initial current endpoint)

        Parameters
        ----------
        endpoint : str
            New default endpoint
        """
        # TODO validate ep is UUID or legacy (not an ID)
        self.cfg.set("default_ep", endpoint, True)
        if not self._cur_ep:
            self._cur_ep = endpoint

    def endpointGet(self):
        """
        Get current Globus endpoint

        Returns
        -------
        str
            current endpoint string, or None if not set
        """
        # TODO: Consider making self._cur_ep more private via self.__cur_ep
        return self._cur_ep

    def endpointSet(self, endpoint):
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

    def setupCredentials(self):
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

        if cfg_dir is None and (pub_file is None or priv_file is None):
            raise Exception(
                "Client configuration directory and/or client key files not configured"
            )

        msg = auth.GenerateCredentialsRequest()

        reply = self._mapi.sendRecv(msg)

        if pub_file is None:
            pub_file = os.path.join(cfg_dir, "datafed-user-key.pub")

        keyf = open(pub_file, "w")
        keyf.write(reply[0].pub_key)
        keyf.close()

        if priv_file is None:
            priv_file = os.path.join(cfg_dir, "datafed-user-key.priv")

        keyf = open(priv_file, "w")
        keyf.write(reply[0].priv_key)
        keyf.close()

    def setContext(self, item_id=None):
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
        if item_id is None:
            if self._cur_sel == self._uid:
                return

            self._cur_sel = self._uid
            self._cur_alias_prefix = ""
        else:
            id2 = item_id

            if id2[0:2] == "p/":
                msg = auth.ProjectViewRequest()
                msg.id = id2
            else:
                if id2[0:2] != "u/":
                    if id2.find("/") > 0 or id2.find(":") > 0:
                        raise Exception(
                            "setContext invalid ID, '"
                            + id2
                            + "'. Must be a user or a project ID"
                        )
                    id2 = "u/" + id2

                msg = auth.UserViewRequest()
                msg.uid = id2

            # Don't need reply - just using to throw an except if id/uid is
            # invalid
            self._mapi.sendRecv(msg)
            self._cur_sel = id2

            if id2[0] == "u":
                # self._cur_coll = "c/u_" + self._cur_sel[2:] + "_root"
                self._cur_alias_prefix = "u:" + self._cur_sel[2:] + ":"
            else:
                # self._cur_coll = "c/p_" + self._cur_sel[2:] + "_root"
                self._cur_alias_prefix = "p:" + self._cur_sel[2:] + ":"

    def getContext(self):
        """
        Gets the current context which is used to resolve relative aliases

        Returns
        -------
        str
            The current user or project ID context string
        """
        return self._cur_sel

    def timestampToStr(self, ts):
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
        return time.strftime("%m/%d/%Y,%H:%M", time.localtime(ts))

    def strToTimestamp(self, time_str):
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
            return int(time_str)
        except BaseException:
            pass

        try:
            return int(datetime.datetime.strptime(time_str, "%m/%d/%Y").timestamp())
        except BaseException:
            pass

        try:
            return int(
                datetime.datetime.strptime(time_str, "%m/%d/%Y,%H:%M").timestamp()
            )
        except BaseException:
            pass

        try:
            return int(
                datetime.datetime.strptime(time_str, "%m/%d/%Y,%H:%M:%S").timestamp()
            )
        except BaseException:
            pass

        return None

    def sizeToStr(self, size, precision=1):
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
        # if not isinstance(size, int):
        #    raise TypeError('size must be a integer')
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

        return "{:.{}f} {}".format(size / denom, precision, unit)

    # =========================================================================
    # --------------------------------------------------------- Private Methods
    # =========================================================================

    def _uniquifyFilename(self, path):
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
            stem = filepath.stem  # string
            suffixes = filepath.suffixes  # list
            stem_parts = stem.split("__", 1)  # list

            if stem_parts[-1].isdigit():  # nth copy
                index_value = int(stem_parts[-1])
                index_value += 1
                stem_parts[-1] = str(index_value)
                new_stem = "__".join(stem_parts)
                new_name = [new_stem]
                for suffix in suffixes:
                    new_name.append(suffix)
                new_name = "".join(new_name)
                filepath = filepath.with_name(new_name)
            else:  # first copy
                new_stem = stem + "__1"
                new_name = [new_stem]
                for suffix in suffixes:
                    new_name.append(suffix)
                new_name = "".join(new_name)
                filepath = filepath.with_name(new_name)

        return str(filepath)

    def _resolvePathForHTTP(self, path):
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
        elif path[0] == "." or path[0] != "/":
            res = pathlib.Path.cwd() / path
            res = res.resolve()
        else:
            res = path

        return str(res)

    def _resolvePathForGlobus(self, path, must_exist):
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
        # Check if this is a full Globus path with either a UUID or legacy
        # endpoint prefix
        if re.match(API._endpoint_legacy, path) or re.match(API._endpoint_uuid, path):
            return path

        # Does not have an endpoint prefix, might be a full or relative path

        if self._cur_ep is None:
            raise Exception("No endpoint set.")

        if path[0] == "~":
            _path = pathlib.Path(path).expanduser()
        elif (
            path[0] == "." or path[0] != "/"
        ):  # Relative path: ./something ../something or something
            _path = pathlib.Path.cwd() / path
        else:
            _path = pathlib.Path(path)

        if must_exist:
            _path = str(_path.resolve())
        else:
            # Can't use resolve b/c it throws an exception when a path doesn't
            # exist pre python 3.6 Must manually locate the lowest relative path
            # component and resolve only to that point Then append then
            # remainder to the resolved portion

            idx = 0
            rel = None

            for p in _path.parts:
                if p == "." or p == "..":
                    rel = idx
                idx = idx + 1

            if rel is not None:
                basep = pathlib.Path()
                endp = pathlib.Path()
                idx = 0
                for p in _path.parts:
                    if idx <= rel:
                        basep = basep.joinpath(p)
                    else:
                        endp = endp.joinpath(p)
                    idx = idx + 1

                _path = basep.resolve().joinpath(endp)

            winp = pathlib.PurePath(_path)

            # TODO The follow windows-specific code needs to be tested on
            # windows...
            if isinstance(winp, pathlib.PureWindowsPath):
                if winp.drive:
                    drive_name = winp.drive.replace(":", "")
                    parts = winp.parts[1:]
                    winp = pathlib.PurePosixPath("/" + drive_name)
                    for item in parts:
                        winp = winp / str(item)  # adds each part
                    _path = str(winp)
                elif not winp.drive:
                    _path = winp.as_posix()
                    if _path[0] != "/":
                        _path = "/" + _path
            else:
                _path = str(_path)

        return self._cur_ep + _path

    def _resolve_id(self, item_id, context=None):
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
        if (len(item_id) > 2 and item_id[1] == "/") or (item_id.find(":") > 0):
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

    def _setSaneDefaultOptions(self):
        """
        Set any missing config options to sane defaults

        Returns
        -------
        opts : dict
            Automatically determined save configuration options
        """
        opts = self.cfg.getOpts()

        # Examine initial configuration options and set & save defaults where
        # needed
        save = False

        if "server_host" not in opts:
            self.cfg.set("server_host", "datafed.ornl.gov")
            opts["server_host"] = "datafed.ornl.gov"
            save = True

        if "server_port" not in opts:
            self.cfg.set("server_port", 7512)
            opts["server_port"] = 7512
            save = True

        if "allow_self_signed_certs" not in opts:
            self.cfg.set("allow_self_signed_certs", False)
            opts["allow_self_signed_certs"] = False
            save = True

        if "server_pub_key_file" not in opts:
            serv_key_file = None

            if "server_cfg_dir" in opts:
                serv_key_file = os.path.expanduser(
                    os.path.join(opts["server_cfg_dir"], "datafed-core-key.pub")
                )
                self.cfg.set("server_pub_key_file", serv_key_file)
                opts["server_pub_key_file"] = serv_key_file

            if not serv_key_file or not os.path.exists(serv_key_file):
                serv_key_file = None
                if "client_cfg_dir" in opts:
                    serv_key_file = os.path.expanduser(
                        os.path.join(opts["client_cfg_dir"], "datafed-core-key.pub")
                    )
                    self.cfg.set("server_pub_key_file", serv_key_file)
                    opts["server_pub_key_file"] = serv_key_file
                    save = True

                if not serv_key_file:
                    raise Exception(
                        "Could not find location of server public key file."
                    )

                if not os.path.exists(serv_key_file):
                    # Make default server pub key file
                    url = "https://" + opts["server_host"] + "/datafed-core-key.pub"

                    # Path where the downloaded file will be saved
                    output_path = serv_key_file

                    try:
                        # Make the request and allow self-signed certificates if needed
                        if opts["allow_self_signed_certs"]:
                            response = requests.get(url, verify=False, stream=True)
                        else:
                            response = requests.get(url, verify=True, stream=True)
                        # Check if the request was successful
                        response.raise_for_status()

                        # Open the file in binary write mode and write the response content
                        with open(output_path, "wb") as file:
                            for chunk in response.iter_content(chunk_size=8192):
                                if chunk:  # Filter out keep-alive new chunks
                                    file.write(chunk)
                        print("File downloaded successfully.")

                    except requests.exceptions.RequestException as e:
                        print(f"Failed to download file: {e}")

        if "client_pub_key_file" not in opts or "client_priv_key_file" not in opts:
            if "client_cfg_dir" not in opts:
                raise Exception(
                    "Client key file(s) or client configuration directory not specified or invalid."
                )

            if "client_pub_key_file" not in opts:
                key_file = os.path.expanduser(
                    os.path.join(opts["client_cfg_dir"], "datafed-user-key.pub")
                )
                self.cfg.set("client_pub_key_file", key_file)
                opts["client_pub_key_file"] = key_file
                save = True

            if "client_priv_key_file" not in opts:
                key_file = os.path.expanduser(
                    os.path.join(opts["client_cfg_dir"], "datafed-user-key.priv")
                )
                self.cfg.set("client_priv_key_file", key_file)
                opts["client_priv_key_file"] = key_file
                save = True

        if save:
            self.cfg.save()

        return opts
