extern "C"
{
	#include "libsdms_gsi_authz.h"
}
#include <iostream>
#include <fstream>
#include <string>
#include <ctime>
#include "sdms_db_authz.h"
#include <unistd.h>
#define DEF_DYNALOG
#include "DynaLog.hpp"
#include "TraceException.hpp"
#include "Util.hpp"
#include "AuthzWorker.hpp"
#include "SDMS.pb.h"

using namespace std;
using namespace SDMS;

const char * getVersion()
{
    static std::string ver_str = std::to_string(VER_MAJOR) + "." + std::to_string(VER_MINOR) + "." + std::to_string(VER_BUILD);
    return ver_str.c_str();
}

int authzdb(char * client_id, char * object, char * action)
{
    int result = -1;

    DL_SET_LEVEL(DynaLog::DL_DEBUG_LEV);
    DL_SET_CERR_ENABLED(false);
    DL_SET_SYSDL_ENABLED(true);

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

