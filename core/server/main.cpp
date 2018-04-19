#include <iostream>
#include <unistd.h>

#define DEF_DYNALOG
#include "DynaLog.hpp"
#include "TraceException.hpp"

#include "CoreServer.hpp"

using namespace std;
using namespace SDMS;

int main( int a_argc, char ** a_argv )
{
    try
    {
        DL_SET_ENABLED(true);
        DL_SET_LEVEL(DynaLog::DL_TRACE_LEV);
        DL_SET_CERR_ENABLED(true);
        DL_SET_SYSDL_ENABLED(false);

        int         port = 5800;
        int         timeout = 5;
        uint32_t    num_threads = 1;
        string      home = getenv("HOME");
        string      cred_path = home + "/.sdms-server/";
        int         opt;
        string      db_url = "https://localhost:8529/_db/sdms/api/";
        string      db_user = "root";
        string      db_pass = "nopass";

        while (( opt = getopt( a_argc, a_argv, "?p:n:t:c:d:U:P:" )) != -1 )
        {
            switch( opt )
            {
            case '?':
                cout << "options:" << endl;
                cout << "?      - show help" << endl;
                cout << "p port - set server port" << endl;
                cout << "n num  - set num threads (0 = optimal)" << endl;
                cout << "t sec  - timeout (sec)" << endl;
                cout << "c dir  - set certificate directory" << endl;
                cout << "d url  - set db url" << endl;
                cout << "U user - set db user" << endl;
                cout << "P pass - set db password" << endl;
                return 0;
            case 'p':
                port = atoi( optarg );
                break;
            case 'n':
                num_threads = (uint32_t)atoi( optarg );
                break;
            case 't':
                timeout = atoi( optarg );
                break;
            case 'c':
                cred_path = optarg;
                break;
            case 'd':
                db_url = optarg;
                break;
            case 'U':
                db_user = optarg;
                break;
            case 'P':
                db_pass = optarg;
                break;
            }
        }

        Core::Server server( port, cred_path, timeout, num_threads, db_url, db_user, db_pass );

        server.run( false );

/*
        server.run( true );
        cout << "wait\n";

        sleep( 30 );
        cout << "stop\n";
        
        server.stop( true );
*/
        cout << "exit\n";
    }
    catch( TraceException &e )
    {
        cout << e.toString() << "\n";
    }
    catch( exception &e )
    {
        cout << "Exception: " << e.what() << "\n";
    }

    return 0;
}

