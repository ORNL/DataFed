#ifndef AUTHZWORKER_H
#define AUTHZWORKER_H

#include "Config.h"

const char *    getVersion();
int             checkAuthorization( char * client_id, char * object, char * action, struct Config * config );

#endif
