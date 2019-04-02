extern "C"
{
	#include "libsdms_gsi_authz.h"
}
#include <iostream>
#include <fstream>
#include <ctime>
#include "sdms_db_authz.h"
#include <unistd.h>
#define DEF_DYNALOG
#include "DynaLog.hpp"
#include "TraceException.hpp"
#include "Util.hpp"
#include "AuthzWorker.hpp"

using namespace std;
using namespace SDMS;

#define VERSION "0.1.0"

#define DL_SET_LEVEL(x) { DynaLog::g_level = x; }
#define DL_SET_CERR_ENABLED(x) { DynaLog::g_use_cerr = x; }
#define DL_SET_SYSDL_ENABLED(x) { DynaLog::g_use_syslog = x; }

int authzdb(char * client_id, char * object, char * action)
{
    int result = -1;

    try
    {
        AuthzWorker server( "/etc/datafed/datafed-authz.conf" );
        result = server.run(client_id, object, action);
    }
    catch( TraceException &e )
    {
        DL_ERROR( "AuthzWorker exception: " << e.toString() );
        //cout << "Exception 1" << e.toString() << endl;
    }
    catch( exception &e )
    {
        DL_ERROR( "AuthzWorker exception: " << e.what() );
        //cout << "Exception 2" << e.what() << endl;
    }
    return result;
}

