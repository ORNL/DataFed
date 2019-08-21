#ifndef AUTHZWORKER_HPP
#define AUTHZWORKER_HPP

const char * getVersion();
int authzdb( char * client_id, char * object, char * action );

#endif
