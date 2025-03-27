#define BOOST_TEST_MAIN

#define BOOST_TEST_MODULE keyGeneration
#include <boost/filesystem.hpp>
#include <boost/test/unit_test.hpp>
//Local private includes
#include "../../include/common/Util.hpp"

//Standard includes
#include <iostream>

BOOST_AUTO_TEST_SUITE(KeyGenerationTest)

BOOST_AUTO_TEST_CASE(testing_KeyGeneration)
{
    unsigned char token_key[32];
    generateEncryptionKey(token_key); 

    std::cout << token_key << std::endl;
}

BOOST_AUTO_TEST_SUITE_END()
