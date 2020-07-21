##
# @package datafed.Config
# Provides client configuration utility
# 
# The DataFed Config module contains a single API class that provides
# a client application-level configuration abstraction. This class is
# optional, but very useful for gathering and presenting all of the
# settings required to enable a client to communicate with a DataFed
# core server.
#
# The Config.API class is used by the DataFed CommandLib module, which
# integrates command-line options into the settings defined by this
# module. For custom applications, the Config module can also be used
# to easily initialize the low-level MessageLib.API class.


import os
import configparser

_OPT_INT     = 0x01
_OPT_BOOL    = 0x02
_OPT_PATH    = 0x04
_OPT_NO_ENV  = 0x08
_OPT_NO_CF   = 0x10
_OPT_NO_CL   = 0x20
_OPT_HIDE    = 0x40
_OPT_EAGER   = 0x80

_opt_info = {
    # key, cf-cat, cf-name, env-name, flags, opt-names, description
    "server_cfg_dir": ["server","config_dir","DATAFED_SERVER_CFG_DIR",_OPT_PATH,["--server-cfg-dir"],"Server configuration directory"],
    "server_cfg_file":["server","config_file","DATAFED_SERVER_CFG_FILE",_OPT_PATH|_OPT_NO_CF,["--server-cfg-file"],"Server configuration file"],
    "server_pub_key_file":["server","public_key_file","DATAFED_SERVER_PUB_KEY_FILE",_OPT_PATH,["--server-pub-key-file"],"Server public key file"],
    "server_host":["server","host","DATAFED_SERVER_HOST",0,["--server-host","-H"],"Sever host name or IP address"],
    "server_port":["server","port","DATAFED_SERVER_PORT",_OPT_INT,["--server-port","-P"],"Server port number"],
    "client_cfg_dir":["client","config_dir","DATAFED_CLIENT_CFG_DIR",_OPT_PATH,["--client-cfg-dir"],"Client configuration directory"],
    "client_cfg_file":["client","config_file","DATAFED_CLIENT_CFG_FILE",_OPT_PATH|_OPT_NO_CF,["--client-cfg-file"],"Client configuration file"],
    "client_pub_key_file":["client","public_key_file","DATAFED_CLIENT_PUB_KEY_FILE",_OPT_PATH,["--client-pub-key-file"],"Client public key file"],
    "client_priv_key_file":["client","private_key_file","DATAFED_CLIENT_PRIV_KEY_FILE",_OPT_PATH,["--client-priv-key-file"],"Client private key file"],
    "client_token":["client","token","DATAFED_CLIENT_TOKEN",_OPT_HIDE,["--client-token"],"Client access token"],
    "default_ep":["general","default_endpoint","DATAFED_DEFAULT_ENDPOINT",0,["--default-ep","-e"],"Default Globus endpoint"],
    "verbosity":["general","verbosity","DATAFED_DEFAULT_VERBOSITY",_OPT_INT,["--verbosity","-v"],"Verbosity level (0=quiet,1=normal,2=verbose) for text-format output only."],
}

##
# @class API
# @brief A client configuration helper class.
#
# The Config.API class provides an interface for loading, accessing,
# and altering DataFed client configuration settings. Settings can be
# set from environment variables, server and client configuration
# files - or overloaded via CLI options. The available settings are
# listed below, including the key, config file section and name,
# environment variable name, CLI option names, and help text. 
# 
# Available Settings:
#
# key                   | type | cf. sec | cf. name        | env. var. name              | long opt.             | short opt.
# ----------------------|------|---------|-----------------|-----------------------------|-----------------------|------------
# server_cfg_dir        | path | server  | config_dir      | DATAFED_SERVER_CFG_DIR      | --server-cfg-dir      |         |
# server_cfg_file       | path |         |                 | DATAFED_SERVER_CFG_FILE     | --server-cfg-file     |         |
# server_pub_key_file   | path | server  | public_key_file | DATAFED_SERVER_PUB_KEY_FILE | --server-pub-key-file |         |
# server_host           | str  | server  | host            | DATAFED_SERVER_HOST         | --server-host         | -H      |
# server_port           | int  | server  | port            | DATAFED_SERVER_PORT         | --server-port         | -P      |
# client_cfg_dir        | path | client  | config_dir      | DATAFED_CLIENT_CFG_DIR      | --client-cfg-dir      |         |
# client_cfg_file       | path | client  | config_file     | DATAFED_CLIENT_CFG_FILE     | --client-cfg-file     |         |
# client_pub_key_file   | path | client  | public_key_file | DATAFED_CLIENT_PUB_KEY_FILE | --client-pub-key-file |         |
# client_priv_key_file  | path | client  | private_key_file| DATAFED_CLIENT_PRIV_KEY_FILE| --client-priv-key-file|         |
# default_ep            | str  | general | default_endpoint| DATAFED_DEFAULT_ENDPOINT    | --default-ep          | -e      |
# verbosity             | int  | general | verbosity       | DATAFED_DEFAULT_VERBOSITY   | --verbosity           | -v      |
# interactive           | bool | general | interactive     | DATAFED_DEFAULT_INTERACT    | --interact/--no-interact | -i/-n   |
#
# Configuration source priority:
#
# 1. set programatically
# 2. set on command-line
# 3. set in client config file
# 4. set in server config file
# 5. set by environment variable
#
class API:

    ##
    # @brief Class initialization method.
    #
    # Creating a Config.API instance will cause settings to be
    # gathered from various sources (see class description for
    # details).
    #
    # @param opts: An optional dictionary of settings. Values set
    #    by this parameter take priority over other setting sources.
    # @exception Exception: if opts parameter is not a dictionary.
    #
    def __init__( self, opts = {} ):
        #print("Config Init")

        self._processOptions( opts )

    def _processOptions( self, opts ):
        if not isinstance( opts, dict ):
            raise Exception( "Config API options parameter must be a dictionary." )

        # Setting priorities:
        # 1. Direct setting (passed in opts, or CLI option)
        # 2. Client config file values
        # 3. Server config file values
        # 4. Environment variables
        # 5. Default (or guessed) values

        self._opts = {}

        for k, v in opts.items():
            if v != None:
                self._opts[k] = {"val": v, "pri": 1}

        #print( "cfg self opts:", self._opts )

        cfg_file = None

        # Start with any defined environment variables
        self._loadEnvironVars()

        # Load server config file, if specified/available

        if "server_cfg_file" in self._opts:
            cfg_file = self._opts["server_cfg_file"]["val"]
        elif 'server_cfg_dir' in self._opts:
            tmp = os.path.expanduser( os.path.join( self._opts['server_cfg_dir']["val"], "datafed-server.ini" ))
            if os.path.exists( tmp ):
                cfg_file = tmp
                self._opts["server_cfg_file"] = {"val": cfg_file, "pri": 5 }

        if not cfg_file:
            tmp = os.path.expanduser("~/.datafed/datafed-server.ini")
            if os.path.exists( tmp ):
                cfg_file = tmp
                self._opts["server_cfg_file"] = {"val": cfg_file, "pri": 5 }

        if cfg_file:
            self._loadConfigFile( cfg_file, 3 )

        # Load client config file, if specified/available

        cfg_file = None
        cfg_dir = None
        loaded = False

        if "client_cfg_file" in self._opts:
            #print("first: client_cfg_file in opts")
            cfg_file = self._opts["client_cfg_file"]["val"]
            if os.path.exists( cfg_file ):
                #print("client_cfg_file found")
                self._loadConfigFile( cfg_file, 2 )
                loaded = True

        if not 'client_cfg_dir' in self._opts:
            cfg_dir = os.path.expanduser("~/.datafed")
            if not os.path.exists( cfg_dir ):
                try:
                    os.mkdir( cfg_dir )
                except:
                    return
            self._opts["client_cfg_dir"] = {"val": cfg_dir, "pri": 5 }

        if not loaded:
            cfg_file = os.path.expanduser( os.path.join( self._opts['client_cfg_dir']["val"], "datafed-client.ini" ))
            self._opts["client_cfg_file"] = {"val": cfg_file, "pri": 5 }
            if os.path.exists( cfg_file ):
                #print("loading cfg file after expanding cfg file path")
                self._loadConfigFile( cfg_file, 2 )
                loaded = True


    def _loadEnvironVars( self ):
        # Check each defined option for a set and non-empty environment variable
        # Priority is next to lowest (4)
        # Values are automatically converted to expected type
        # Options with _OPT_NO_ENV are ignored
        for k, v in _opt_info.items():
            if (not k in self._opts) and ((v[3] & _OPT_NO_ENV) == 0) and (v[2] in os.environ) and os.environ[v[2]]:
                tmp = os.environ[v[2]]
                if v[3] & _OPT_INT:
                    try:
                        tmp = int(tmp)
                    except:
                        raise Exception( "Invalid value specified for {} ({}) from ENV {}".format(k,tmp,v[2]) )
                elif v[3] & _OPT_BOOL:
                    tmp = tmp.lower()
                    if tmp in ("true","yes","1"):
                        tmp = True
                    elif tmp in ("false","no","0"):
                        tmp = False
                    else:
                        raise Exception("Invalid value for {} ({}) from ENV {}".format(k,tmp,v[2]))
                elif v[3] & _OPT_PATH:
                    tmp = os.path.expanduser(tmp)

                self._opts[k] = {"val": tmp, "pri": 4}

    def _loadConfigFile( self, cfg_file, priority ):
        # Read config file and check each defined option for a contained value using section and name
        # Priority is set by parameter (3 or 4)
        # Values are automatically converted to expected type
        # Options with _OPT_NO_CF are ignored
        try:
            with open( cfg_file, 'r') as f:
                config = configparser.ConfigParser()
                config.read_file(f)

                for k, v in _opt_info.items():
                    if ((not k in self._opts) or self._opts[k]["pri"] >= priority) and (v[3] & _OPT_NO_CF) == 0:
                        if config.has_option(v[0],v[1]):
                            tmp = config.get(v[0],v[1])
                            if v[3] & _OPT_INT:
                                try:
                                    tmp = int(tmp)
                                except:
                                    raise Exception( "Invalid value specified for {} ({}) in {}".format(k,tmp,cfg_file) )
                            elif v[3] & _OPT_BOOL:
                                tmp = tmp.lower()
                                if tmp in ("true","yes","1"):
                                    tmp = True
                                elif tmp in ("false","no","0"):
                                    tmp = False
                                else:
                                    raise Exception("Invalid value for {} ({}) in {}".format(k,tmp,cfg_file))
                            elif v[3] & _OPT_PATH:
                                tmp = os.path.expanduser(tmp)

                            self._opts[k] = {"val": tmp, "pri": priority}
        except IOError:
            raise Exception("Error reading from server config file: " + cfg_file)

    ##
    # @brief Print details of current settings
    #
    # Prints all set settings with key, value, and source information
    #
    def printSettingInfo(self):
        p = 0
        for k, v in self._opts.items():
            p = v["pri"]
            if p == 5:
                print("  {} = \"{}\" (assumed)".format(k,v["val"]))
            elif p == 4:
                print("  {} = \"{}\" from {}".format(k,v["val"],_opt_info[k][2]))
            elif p == 3:
                print("  {} = \"{}\" from server config file".format(k,v["val"]))
            elif p == 2:
                print("  {} = \"{}\" from client config file".format(k,v["val"]))
            elif p == 1:
                print("  {} = \"{}\" from CLI option".format(k,v["val"]))

    ##
    # @brief Get dictionary of all set configuration options.
    #
    # @return A dict of set options with values.
    # @retval dict
    #
    def getOpts(self):
        opts = {}
        for k, v in self._opts.items():
            opts[k] = v["val"]
        return opts

    ##
    # @brief Get the value of a configuration option.
    #
    # @param key Configuration option key
    # @return Value of option, if set; None otherwise
    # @retval varies
    # @exception Exception: If unknown key is provided.
    #
    def get( self, key ):
        if not key in _opt_info:
            raise Exception("Undefined configuration key: " + key )

        if key in self._opts:
            return self._opts[key]["val"]
        else:
            return None

    ##
    # @brief Set the value of an configuration option.
    #
    # @param key Configuration option key
    # @param value New value for option
    # @param save If True, save new value to client configuration file.
    # @exception Exception: If unknown key is provided.
    #
    def set( self, key, value, save = False ):
        if not key in _opt_info:
            raise Exception("Undefined configuration key:",key)

        if key in self._opts:
            self._opts[key]["val"] = value
        else:
            self._opts[key] = { "val" : value, "pri" : 0 }

        if save:
            self.save()
            #with open( self._opts["client_cfg_file"]["val"], 'r+') as f:
            #    config = configparser.ConfigParser()
            #    config.read_file( f )
            #    opt = _opt_info[key]
            #    if not config.has_section( opt[0] ):
            #        config.add_section( opt[0] )
            #    config.set( opt[0], opt[1], value )
            #    f.seek(0)
            #    f.truncate()
            #    config.write( f )

    def save( self ):
        if "client_cfg_file" in self._opts:
            config = configparser.ConfigParser()
            for key, val in self._opts.items():
                if key in _opt_info:
                    opt = _opt_info[key]
                    if not config.has_section( opt[0] ):
                        config.add_section( opt[0] )
                    config.set( opt[0], opt[1], str(val["val"]) )
            with open( self._opts["client_cfg_file"]["val"], 'w') as f:
                f.truncate()
                config.write( f )

