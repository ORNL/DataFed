#include <iostream>
#include <unistd.h>

#include <time.h>

#define timerDef() struct timespec _T0 = {0,0}, _T1 = {0,0}
#define timerStart() clock_gettime(CLOCK_REALTIME,&_T0)
#define timerStop() clock_gettime(CLOCK_REALTIME,&_T1)
#define timerElapsed() ((_T1.tv_sec - _T0.tv_sec) + ((_T1.tv_nsec - _T0.tv_nsec)/1.0e9))

#include "TraceException.hpp"
#include "Client.hpp"

using namespace std;
using namespace SDMS;
using namespace SDMS::Facility;


void doMsgTest( Client & client, int iter )
{
    timerDef();

    cout << "msg marshalling test...";

    timerStart();

    client.test( iter );

    timerStop();

    cout << " time: " << timerElapsed() << " sec, iter/sec: " << iter/timerElapsed() << "\n";
}


void perfTest( Client & client, int iter )
{
    timerDef();
    spCollDataReply colls;

    cout << "perf test...";

    timerStart();

    for ( int i = 0; i < iter; ++i )
    {
        //users = client.userList();
        colls = client.collList( "d3s" );
    }

    timerStop();
    cout << " time: " << timerElapsed() << " sec, ops/sec: " << iter/timerElapsed() << "\n";
}


int main( int a_argc, char ** a_argv )
{
    try
    {
        const char * host = "127.0.0.1";
        int port = 5800;
        int timeout = 5;
        int opt;
        bool gen_cert = false;
        const char * cred_path = "/home/d3s/.sdms/";
        const char * unit = "CCS";

        while (( opt = getopt( a_argc, a_argv, "?h:p:t:c:gu:" )) != -1 )
        {
            switch( opt )
            {
            case '?':
                cout << "options:" << endl;
                cout << "?      - show help" << endl;
                cout << "h name - server hostname" << endl;
                cout << "p port - server port number" << endl;
                cout << "t sec  - timeout (sec)" << endl;
                cout << "c cred - specify path to credentials" << endl;
                cout << "u unit - specify unit" << endl;
                cout << "g      - generate new client credentials" << endl;
                return 0;
            case 'h':
                host = optarg;
                break;
            case 'p':
                port = atoi( optarg );
                break;
            case 't':
                timeout = atoi( optarg );
                break;
            case 'c':
                cred_path = optarg;
                break;
            case 'u':
                unit = optarg;
                break;
            case 'g':
                gen_cert = true;
                break;
            }
        }

        //timerDef();

        cout << "Starting client (" << unit << ")" << endl;

        Client client( host, port, timeout, cred_path, unit, !gen_cert );

        client.start();
        if ( gen_cert )
        {
            client.authenticate( "d3s", "password" );
            client.generateCredentials();

            exit(0);
        }


        spUserDataReply users;
        //spRecordDataReply records;
        spCollDataReply colls;


        //msgTest( client );
        //pingTest( client, 1000 );
        //perfTest( client );


        //client.getData( "jdat1", "/home/d3s/xxxx/yyy", CREATE_PATH );

/*
        records = client.recordView( "d3s:ddat1" );
        if ( records->record_size() == 1 )
        {
            const RecordData & rec = records->record(0);
            cout << "Record id: " << rec.id() << ", title: " << rec.title() << "\n";
        }
        else
            cout << "Record not found\n";
*/

        //cout << "trans ID: " << client.getData( "d3s:ddat1", "/home/d3s/xxxx", CREATE_PATH | BACKUP ) << "\n";


/*
        users = client.userView( "" );
        if ( users->user_size() == 1 )
        {
            const UserData & user = users->user(0);
            cout << "uid: " << user.uid() << ", name: " << user.name_first() << " " << user.name_last() << "\n";
        }

        users = client.userView( "d3s" );
        if ( users->user_size() == 1 )
        {
            const UserData & user = users->user(0);
            cout << "uid: " << user.uid() << ", name: " << user.name_first() << " " << user.name_last() << "\n";
        }
*/

/*
        users = client.userView( "d3s" );
        if ( users->user_size() == 1 )
        {
            const UserData & user = users->user(0);
            cout << "uid: " << user.uid() << ", name: " << user.name_first() << " " << user.name_last() << "\n";
        }
*/


        colls = client.collList( "" );
        cout << "my collection count: " << colls->coll_size() << "\n";
        for ( int i = 0; i < colls->coll_size(); ++i )
        {
            const CollData & coll = colls->coll(i);
            cout << "id: " << coll.id() << ", title: " << coll.title() << "\n";
        }


/*
        colls = client.collList( "user1" );
        cout << "user1 collection count: " << colls->coll_size() << "\n";
        for ( int i = 0; i < colls->coll_size(); ++i )
        {
            const CollData & coll = colls->coll(i);
            cout << "id: " << coll.id() << ", title: " << coll.title() << "\n";
        }
*/

/*
        spUserDataReply users = client.userList();

        cout << "user count: " << users->user_size() << "\n";
        for ( int i = 0; i < users->user_size(); ++i )
        {
            const UserData & user = users->user(i);
            cout << "uid: " << user.uid() << ", name: " << user.name_first() << " " << user.name_last() << "\n";
        }

        users.reset();
*/
        //client.stop();
        //sleep( 5 );
    }
    catch( TraceException &e )
    {
        cout << "Exception: " << e.toString() << "\n";
    }
    catch( exception &e )
    {
        cout << "Exception: " << e.what() << "\n";
    }

    return 0;
}

