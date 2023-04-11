#ifndef AUTHZWORKER_H
#define AUTHZWORKER_H

//#include "MsgBuf.hpp"
//#include "MsgComm.hpp"
//#include "Util.hpp"
//#define DEF_DYNALOG
//#include "DynaLog.hpp"

const char *    getVersion();
int             checkAuthorization( char * client_id, char * object, char * action );
int initAuthzConfig();
const char * getLocalUserName();


#endif // AUTHZWORKER_H
