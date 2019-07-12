"""
The Config.API class provides an interface for loading, accessing, and altering
DataFed client configuration settings. Settings can be set from environment
variables, server and client configuration files, and directly via CLI options.
The available settings are listed in the "opt_info" list, which defines the
key, config file section and name, environment variable name, CLI options, and
help text for each configuration setting. 

Configuration source priority:
1. set programatically
2. set on command-line
3. set in client config file
4. set in server config file
5. set by environment variable
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

    ["server-cfg-dir","server","config_dir","DATAFED_SERVER_CFG_DIR",0,["--server-cfg-dir"],"Server configuration directory"],
    ["server-cfg-file","server","config_file","DATAFED_SERVER_CFG_FILE",OPT_NO_CF,["--server-cfg-file"],"Server configuration file"],
    ["server-pub-key-file","server","public_key_file","DATAFED_SERVER_PUB_KEY_FILE",0,["--server-pub-key-file"],"Server public key file"],
    ["server-host","server","host","DATAFED_SERVER_HOST",0,["--server-host","-H"],"Server host name or IP address"],
    ["server-port","server","port","DATAFED_SERVER_PORT",OPT_INT,["--server-port","-P"],"Server port number"],
    ["client-cfg-dir","client","config_dir","DATAFED_CLIENT_CFG_DIR",OPT_PATH,["--client-cfg-dir"],"Client configuration directory"],
    ["client-cfg-file","client","config_file","DATAFED_CLIENT_CFG_FILE",OPT_PATH|OPT_NO_CF,["--client-cfg-file"],"Client configuration file"],
    ["client-pub-key-file","client","public_key_file","DATAFED_CLIENT_PUB_KEY_FILE",OPT_PATH,["--client-pub-key-file"],"Client public key file"],
    ["client-priv-key-file","client","private_key_file","DATAFED_CLIENT_PRIV_KEY_FILE",OPT_PATH,["--server-priv-key-file"],"Client private key file"],
    ["default-ep","general","default_endpoint","DATAFED_DEFAULT_ENDPOINT",0,["--default-ep","-e"],"Default Globus endpoint"],
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
            if os.path.exists( cfg_file ):
                self._loadConfigFile( cfg_file, 2 )
            else:
                open( cfg_file, "a" ).close()
        elif 'client_cfg_dir' in self.opts:
            cfg_file = os.path.expanduser( os.path.join( self.opts['client_cfg_dir']["val"], "client.ini" ))
            self.opts["client_cfg_file"] = {"val": cfg_file, "pri": 5 }
            if os.path.exists( cfg_file ):
                self._loadConfigFile( cfg_file, 2 )
            else:
                open( cfg_file, "a" ).close()
        else:
            cfg_file = os.path.expanduser("~/.datafed/client.ini")
            if os.path.exists( cfg_file ):
                self.opts["client_cfg_file"] = {"val": cfg_file, "pri": 5 }
                self._loadConfigFile( cfg_file, 2 )
            else:
                tmp = os.path.expanduser( "~/.datafed" )
                if not os.path.exists( tmp ):
                    try:
                        os.mkdir( tmp )
                        cfg_file = os.path.join( tmp, "client.ini" )
                        open( cfg_file, "a" ).close()
                    except:
                        pass


    def _loadEnvironVars( self ):
        for oi in opt_info:
            if (not oi[0] in self.opts) and ((oi[4] & OPT_NO_ENV) == 0) and (oi[3] in os.environ) and os.environ[oi[3]]:
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
                #print("cfg:",config)
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

    def get( self, key ):
        if key in self.opts:
            return self.opts[key]["val"]
        else:
            return None

    def set( self, key, value, save = False ):
        opt = None
        for oi in opt_info:
            if oi[0] == key:
                opt = oi
                break

        if not opt:
            raise Exception("Undefined configuration key")

        if key in self.opts:
            self.opts[key]["val"] = value
        else:
            self.opts[key] = { "val" : value, "pri" : 0 }

        if save and "client_cfg_file" in self.opts:
            with open( self.opts["client_cfg_file"]["val"], 'r+') as f:
                config = configparser.ConfigParser()
                config.read_file( f )
                if not config.has_section( opt[1] ):
                    config.add_section( opt[1] )
                config.set( opt[1], opt[2], value )
                f.seek(0)
                config.write( f )


