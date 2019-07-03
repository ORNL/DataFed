"""
Functions for creating, reading, and writing to the DataFed configuration files.
There are four major environment variables:
The directory paths for server and client credentials, the default Globus endpoint, and the local globus endpoint.
"""


import os
import configparser

configfile = "DataFedConfig.ini"
config = configparser.ConfigParser()
configFilePath = (os.path.join(str(os.getcwd()), configfile))

#Writing
class Config:
    "Interact with configuration variables"

    @classmethod
    def create(cls):
        """Make default config file"""
        if not os.path.isfile(configFilePath):
            config.add_section('DF')
            config['DF']['DF_SERVER_CRED_DIR'] =  str(os.path.normcase(
                os.path.expanduser('~/DataFed/datafed/SERVER_CRED/')))
            config['DF']['DF_CLIENT_CRED_DIR'] = str(
                os.path.normcase(os.path.expanduser('~/DataFed/datafed/CLIENT_CRED/')))
            with open(configFilePath, 'w') as cfgf:
                config.write(cfgf)
        else:
            print("Configuration file already exists.")

    @classmethod
    def set_default_ep(cls, default_ep):
        """Set default endpoint in configuration file"""
        with open(configFilePath, 'w+') as cfgf:
            config.read_file(cfgf)
            config.set('DF', 'DF_DEFAULT_ENDPOINT', str(default_ep))
            config.write(cfgf)
        os.environ['DF_DEFAULT_ENDPOINT'] = str(default_ep) ## Can this be done here? Or must it be in the datafed app code???

    @classmethod
    def set_local_ep(cls, local_ep):
        """Set default endpoint in configuration file"""
        with open(configFilePath, 'w+') as cfgf:
            config.read_file(cfgf)
            config.set('DF', 'DF_LOCAL_ENDPOINT', str(local_ep))
            config.write(cfgf)
        os.environ['DF_LOCAL_ENDPOINT'] = str(local_ep)

    @classmethod
    def get_config(cls, env_var):
        "Get specified value from DataFedConfig.ini"
        if not os.path.isfile(configFilePath):
            cls.create()
        else:
            pass
        with open(configFilePath, 'r') as cfgf:
            config.read_file(cfgf)
            environment_variable = config.get('DF', str(env_var), fallback=None)
        return environment_variable

