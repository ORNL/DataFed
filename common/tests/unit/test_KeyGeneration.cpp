#define BOOST_TEST_MAIN

#define BOOST_TEST_MODULE keyGeneration
#include <boost/filesystem.hpp>
#include <boost/test/unit_test.hpp>
//Local private includes
#include "../../include/common/Util.hpp"

//Standard includes
#include <iostream>
#include <fstream>

BOOST_AUTO_TEST_SUITE(KeyGenerationTest)

BOOST_AUTO_TEST_CASE(testing_KeyGeneration)
{
    unsigned char token_key[32];
    unsigned char keyArray[32];
    unsigned char finalArray[32];
    generateEncryptionKey(token_key);

    std::string fname = "datafed-token-key.txt";
    std::ofstream  outf(fname.c_str());   
    outf << token_key;
    outf.close();

    //Grabbing key
    std::ifstream keyFile("datafed-token-key.txt", std::ios::binary);

    keyFile.read(reinterpret_cast<char*>(keyArray),32);
    for (int lv = 0; lv < 32; lv++)
    {
            finalArray[lv] = keyArray[lv];
    }

 
    BOOST_CHECK(sizeof(finalArray)==32);
}

BOOST_AUTO_TEST_SUITE_END()
