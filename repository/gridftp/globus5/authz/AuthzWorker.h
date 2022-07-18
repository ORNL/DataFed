#ifndef AUTHZWORKER_H
#define AUTHZWORKER_H

const char *    getVersion();
int             checkAuthorization( char * client_id, char * object, char * action );

#endif
