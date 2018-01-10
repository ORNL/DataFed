#include <iostream>
#include "sdmsclient.hpp"

using namespace std;
using namespace SDMS;

int main( int a_argc, char ** a_argv )
{
    try
    {
        Client  client( "foo.bar.org", 1234 );

        client.doSomething();

        Client::shutdown();
    }
    catch( exception &e )
    {
        cout << "Exception: " << e.what() << "\n";
    }

    return 0;
}

