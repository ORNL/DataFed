"""
The DataFed Config module contains a single API class that provides
a client application-level configuration abstraction. This class is
optional, but very useful for gathering and presenting all of the
settings required to enable a client to communicate with a DataFed
core server.

The Config.API class is used by the DataFed CommandLib module, which
integrates command-line options into the settings defined by this
module. For custom applications, the Config module can also be used
to easily initialize the low-level MessageLib.API class.
"""

import os
import configparser

OPT_INT     = 0x01
OPT_BOOL    = 0x02
OPT_PATH    = 0x04
OPT_NO_ENV  = 0x08
OPT_NO_CF   = 0x10
OPT_NO_CL   = 0x20

opt_info = {
    # key, cf-cat, cf-name, env-name, flags, opt-names, description
    "server_cfg_dir": ["server","config_dir","DATAFED_SERVER_CFG_DIR",OPT_PATH,["--server-cfg-dir"],"Server configuration directory"],
    "server_cfg_file":["server","config_file","DATAFED_SERVER_CFG_FILE",OPT_PATH|OPT_NO_CF,["--server-cfg-file"],"Server configuration file"],
    "server_pub_key_file":["server","public_key_file","DATAFED_SERVER_PUB_KEY_FILE",OPT_PATH,["--server-pub-key-file"],"Server public key file"],
    "server_host":["server","host","DATAFED_SERVER_HOST",0,["--server-host","-H"],"Sever host name or IP address"],
    "server_port":["server","port","DATAFED_SERVER_PORT",OPT_INT,["--server-port","-P"],"Server port number"],
    "client_cfg_dir":["client","config_dir","DATAFED_CLIENT_CFG_DIR",OPT_PATH,["--client-cfg-dir"],"Client configuration directory"],
    "client_cfg_file":["client","config_file","DATAFED_CLIENT_CFG_FILE",OPT_PATH|OPT_NO_CF,["--client-cfg-file"],"Client configuration file"],
    "client_pub_key-file":["client","public_key_file","DATAFED_CLIENT_PUB_KEY_FILE",OPT_PATH,["--client-pub-key-file"],"Client public key file"],
    "client_priv_key-file":["client","private_key_file","DATAFED_CLIENT_PRIV_KEY_FILE",OPT_PATH,["--server-priv-key-file"],"Client private key file"],
    "default_ep":["general","default_endpoint","DATAFED_DEFAULT_ENDPOINT",0,["--default-ep","-e"],"Default Globus endpoint"],
    "verbosity":["general","verbosity","DATAFED_DEFAULT_VERBOSITY",OPT_INT,["--verbosity","-v"],"Verbosity level (0=quiet,1=normal,2=verbose) for text-format output only."],
    "interactive":["general","interactive","DATAFED_DEFAULT_INTERACT",OPT_BOOL,["-i/-n"],"Start an interactive session"]
}

class API:
    """"
    DataFed client configuration class.

    The Config.API class provides an interface for loading, accessing,
    and altering DataFed client configuration settings. Settings can be
    set from environment variables, server and client configuration
    files - or overloaded via CLI options. The available settings are
    listed in the Config module's "opt_info" attribute, which defines
    the key, config file section and name, environment variable name,
    CLI option names, and help text for each configuration setting. 

    Configuration source priority:
    1. set programatically
    2. set on command-line
    3. set in client config file
    4. set in server config file
    5. set by environment variable
    """

    def __init__( self, opts = {} ):
        """
        Config.API class initialization method.

        Creating a Config.API instance will cause settings to be
        gathered from various sources (see class description for
        details).

        :param opts :dict An optional dictionary of settings. Values set
            by this parameter take priority over other setting sources.

        :raise: Exception: if opts parameter is not a dictionary.
        """
        self._processOptions( opts )

    def _processOptions( self, opts ):
        if not isinstance( opts, dict ):
            raise Exception( "Options parameter must be a dictionary." )

        # Setting priorities:
        # 1. Direct setting (passed in opts, or CLI option)
        # 2. Client config file values
        # 3. Server config file values
        # 4. Environment variables
        # 5. Default (or guessed) values

        self.opts = {}

        for k, v in opts.items():
            self.opts[k] = {val: v, pri: 1}

        cfg_file = None

        # Start with any defined environment variables
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
        # Check each defined option for a set and non-empty environment variable
        # Priority is next to lowest (4)
        # Values are automatically converted to expected type
        # Options with OPT_NO_ENV are ignored
        for k, v in opt_info.items():
            if (not k in self.opts) and ((v[3] & OPT_NO_ENV) == 0) and (v[2] in os.environ) and os.environ[v[2]]:
                tmp = os.environ[v[2]]
                if v[3] & OPT_INT:
                    tmp = int(tmp)
                elif v[3] & OPT_BOOL:
                    tmp = bool(int(tmp))
                elif v[3] & OPT_PATH:
                    tmp = os.path.expanduser(tmp)

                self.opts[k] = {"val": tmp, "pri": 4}

    def _loadConfigFile( self, cfg_file, priority ):
        # Read config file and check each defined option for a contained value using section and name
        # Priority is set by parameter (3 or 4)
        # Values are automatically converted to expected type
        # Options with OPT_NO_CF are ignored
        try:
            with open( cfg_file, 'r') as f:
                config = configparser.ConfigParser()
                config.read_file(f)

                for k, v in opt_info.items():
                    if ((not k in self.opts) or self.opts[k]["pri"] >= priority) and (v[3] & OPT_NO_CF) == 0:
                        if config.has_option(v[0],v[1]):
                            tmp = config.get(v[0],v[1])
                            if v[3] & OPT_INT:
                                tmp = int(tmp)
                            elif v[3] & OPT_BOOL:
                                tmp = bool(int(tmp))
                            elif v[3] & OPT_PATH:
                                tmp = os.path.expanduser(tmp)

                            self.opts[k] = {"val": tmp, "pri": priority}
        except IOError:
            raise Exception("Error reading from server config file: " + cfg_file)

    def getOpts(self):
        """
        Get dictionary of all set configuration options.

        Returns:
            A dict of set options with values.
        """
        opts = {}
        for k, v in self.opts.items():
            opts[k] = v["val"]
        return opts

    def get( self, key ):
        """
        Get the value of a configuration option.

        Args:
            key: Configuration option key (see opt_info)

        Returns:
            Value of option, if set; None otherwise
        
        Raises:
            Exception: If unknown key is provided.
        """
        if not key in opt_info:
            raise Exception("Undefined configuration key")

        if key in self.opts:
            return self.opts[key]["val"]
        else:
            return None

    def set( self, key, value, save = False ):
        """
        Set the value of an configuration option.

        Args:
            key: Configuration option key (see opt_info)
            value: New value for option
            save: If True, save new value to client configuration file.

        Raises:
            Exception: If unknown key is provided.
        """
        if not key in opt_info:
            raise Exception("Undefined configuration key")

        if key in self.opts:
            self.opts[key]["val"] = value
        else:
            self.opts[key] = { "val" : value, "pri" : 0 }

        if save and "client_cfg_file" in self.opts:
            with open( self.opts["client_cfg_file"]["val"], 'r+') as f:
                config = configparser.ConfigParser()
                config.read_file( f )
                opt = opt_info[key]
                if not config.has_section( opt[0] ):
                    config.add_section( opt[0] )
                config.set( opt[0], opt[1], value )
                f.seek(0)
                config.write( f )


