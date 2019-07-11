"""
Functions for creating, reading, and writing to the DataFed configuration files.
There are four major environment variables:
The directory paths for server and client credentials, the default Globus endpoint, and the local globus endpoint.
"""

"""
CLI Configuration Priority:
1. set on command-line (temporary)
2. set in config file
3. set by environment variable

CLI Settings/Inputs:
- Server public key file
- Server config directory (for server config and public key)
- Client public & private key files
- Client config directory (for client config file and keys)
- DataFed "core" server address & port
- Configuration file (containing any/all of above)
"""

import os
import configparser


OPT_INT     = 0x01
OPT_BOOL    = 0x02
OPT_PATH    = 0x04
OPT_NO_ENV  = 0x08
OPT_NO_CF   = 0x10
OPT_NO_CL   = 0x20

opt_info = [
    # key, cf-cat, cf-name, env-name, flags, opt-names, description
    ["server_cfg_dir","server","config_dir","DATAFED_SERVER_CFG_DIR",OPT_PATH,["--server-cfg-dir"],"Server configuration directory"],
    ["server_cfg_file","server","config_file","DATAFED_SERVER_CFG_FILE",OPT_PATH|OPT_NO_CF,["--server-cfg-file"],"Server configuration file"],
    ["server_pub_key_file","server","public_key_file","DATAFED_SERVER_PUB_KEY_FILE",OPT_PATH,["--server-pub-key-file"],"Server public key file"],
    ["server_host","server","host","DATAFED_SERVER_HOST",0,["--server-host","-H"],"Sever host name or IP address"],
    ["server_port","server","port","DATAFED_SERVER_PORT",OPT_INT,["--server-port","-P"],"Server port number"],
    ["client_cfg_dir","client","config_dir","DATAFED_CLIENT_CFG_DIR",OPT_PATH,["--client-cfg-dir"],"Client configuration directory"],
    ["client_cfg_file","client","config_file","DATAFED_CLIENT_CFG_FILE",OPT_PATH|OPT_NO_CF,["--client-cfg-file"],"Client configuration file"],
    ["client_pub_key-file","client","public_key_file","DATAFED_CLIENT_PUB_KEY_FILE",OPT_PATH,["--client-pub-key-file"],"Client public key file"],
    ["client_priv_key-file","client","private_key_file","DATAFED_CLIENT_PRIV_KEY_FILE",OPT_PATH,["--server-priv-key-file"],"Client private key file"],
    ["default_ep","general","default_endpoint","DATAFED_DEFAULT_ENDPOINT",0,["--default-ep","-e"],"Default Globus endpoint"],
    ["verbosity","general","verbosity","DATAFED_DEFAULT_VERBOSITY",OPT_INT,["--verbosity","-v"],"Verbosity level (0=quiet,1=normal,2=verbose) for text-format output only."],
    ["interactive","general","interactive","DATAFED_DEFAULT_INTERACT",OPT_BOOL,["-i/-n"],"Start an interactive session"]
]

class API:
    "Interact with configuration variables"

    def __init__( self, opts = {} ):
        #self.parser = configparser.ConfigParser()
        #self._initOptions( opts )
        self._processOptions( opts )

        #for k, v in self.opts.items():
        #    print( k, " = ", v )

    def _processOptions( self, opts ):
        if not isinstance( opts, dict ):
            raise Exception( "Options parameter must be a dictionary." )

        # Setting priorities:
        # 1. Direct setting (passed in opts, or CLI option)
        # 2. Client config file values
        # 3. Server config file values
        # 4. Environment variables

        self.opts = {}

        for k, v in opts.items():
            self.opts[k] = {val: v, pri: 1}

        cfg_file = None
        #cfg_dir = None

        self._loadEnvironVars()

        # Load server config file, if specified/available

        if "server_cfg_file" in self.opts:
            cfg_file = self.opts["server_cfg_file"]["val"]
        elif 'server_cfg_dir' in self.opts:
            tmp = os.path.expanduser( os.path.join( self.opts['server_cfg_dir']["val"], "server.ini" ))
            if os.path.exists( tmp ):
                cfg_file = tmp

        if not cfg_file:
            tmp = os.path.expanduser("~/.datafed/server.ini")
            if os.path.exists( tmp ):
                cfg_file = tmp

        if cfg_file:
            self._loadConfigFile( cfg_file, 3 )

        # Load client config file, if specified/available

        cfg_file = None

        if "client_cfg_file" in self.opts:
            cfg_file = self.opts["client_cfg_file"]["val"]
        elif 'client_cfg_dir' in self.opts:
            tmp = os.path.expanduser( os.path.join( self.opts['client_cfg_dir']["val"], "client.ini" ))
            if os.path.exists( tmp ):
                cfg_file = tmp

        if not cfg_file:
            tmp = os.path.expanduser("~/.datafed/client.ini")
            if os.path.exists( tmp ):
                cfg_file = tmp

        if cfg_file:
            self._loadConfigFile( cfg_file, 2 )

    def _loadEnvironVars( self ):
        for oi in opt_info:
            if (not oi[0] in self.opts) and ((oi[4] & OPT_NO_ENV) == 0) and (oi[3] in os.environ):
                self.opts[oi[0]] = {"val": os.environ[oi[3]], "pri": 4}
                tmp = os.environ[oi[3]]
                if oi[4] & OPT_INT:
                    tmp = int(tmp)
                elif oi[4] & OPT_BOOL:
                    tmp = bool(int(tmp))
                elif oi[4] & OPT_PATH:
                    tmp = os.path.expanduser(tmp)

                self.opts[oi[0]] = {"val": tmp, "pri": 4}

    def _loadConfigFile( self, cfg_file, priority ):
        try:
            with open( cfg_file, 'r') as f:
                config = configparser.ConfigParser()
                config.read_file(f)

                for oi in opt_info:
                    if ((not oi[0] in self.opts) or self.opts[oi[0]]["pri"] >= priority) and (oi[4] & OPT_NO_CF) == 0:
                        if config.has_option(oi[1],oi[2]):
                            tmp = config.get(oi[1],oi[2])
                            if oi[4] & OPT_INT:
                                tmp = int(tmp)
                            elif oi[4] & OPT_BOOL:
                                tmp = bool(int(tmp))
                            elif oi[4] & OPT_PATH:
                                tmp = os.path.expanduser(tmp)

                            self.opts[oi[0]] = {"val": tmp, "pri": priority}
        except IOError:
            raise Exception("Error reading from server config file: " + cfg_file)

    def get(self,key):
        if key in self.opts:
            return self.opts[key]["val"]
        else:
            return None

def set_default_ep( default_ep ):
    pass

def set_local_ep( local_ep ):
    pass





