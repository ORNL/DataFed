extern "C"
{
	#include "libsdms_gsi_authz.h"
}
#include <iostream>
#include <fstream>
#include <ctime>
#include "test.h"

using namespace std;

void write2file() {
    ofstream myfile;
    myfile.open ("/home/cades/SDMSLarry/testCXX.txt",ios::app);
    myfile << "Writing to a file.\n";
    time_t current_time;
    current_time = time(NULL);
    myfile << current_time << "\n";
    myfile.close();
}

/*
int main() 
{
    cout << "Hello, World!\n";
    write2file();
    return 0;
}
*/
