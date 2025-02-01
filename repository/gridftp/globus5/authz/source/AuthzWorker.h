#ifndef AUTHZWORKER_H
#define AUTHZWORKER_H

#include "Config.h"

const char *getVersion();
const char *getAPIVersion();
const char *getReleaseVersion();
int checkAuthorization(char *client_id, char *object, char *action,
                       struct Config config, int thread_id);

#endif
