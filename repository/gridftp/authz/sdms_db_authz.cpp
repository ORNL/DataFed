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


int authzdb(char * client_id, char * object, char * action)
{
    int result = 1;

    try
    {
        string cred_dir = "home/cades/.sdms/";
        string authz_file = "/etc/grid-security/sdms-authz.conf";
        AuthzWorker server( cred_dir, authz_file);
        result = server.run(client_id, object, action);
    }
    catch( TraceException &e )
    {
        //cout << "Exception 1" << e.toString() << endl;
    }
    catch( exception &e )
    {
        //cout << "Exception 2" << e.what() << endl;
    }
    return result;
}

