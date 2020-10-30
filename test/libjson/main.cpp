#include <iostream>

#if defined(_WIN32) || defined(_WIN64)
    #include <windows.h>
    #include <profileapi.h>
#else
    #include <time.h>
#endif

#include "libjson.hpp"

using namespace std;
using namespace libjson;

#if defined(_WIN32) || defined(_WIN64)

    // Define local vars need by timer functions
    #define timerDef() LARGE_INTEGER _T0 = {0,0}, _T1 = {0,0}, _T2 = {0,0}, _F; (void)_T0; (void)_T1; (void)_T2; QueryPerformanceFrequency( &_F );

    // Start timer
    #define timerStart() QueryPerformanceCounter( &_T0 )

    // Stop timer
    #define timerStop() QueryPerformanceCounter( &_T1 )

    // Calc elapsed time
    #define timerElapsed() (( _T1.QuadPart - _T0.QuadPart ) / (double)_F.QuadPart )

    // get current absolute time in sec
    #define timerNow() ( QueryPerformanceCounter( &_T2 )?( _T2.QuadPart / (double)_F.QuadPart):0 )

#else

    // Define local vars need by timer functions
    #define timerDef() struct timespec _T0 = {0,0}, _T1 = {0,0}, _T2 = {0,0}; (void)_T0; (void)_T1; (void)_T2;

    // Start timer
    #define timerStart() clock_gettime(CLOCK_REALTIME,&_T0)

    // Stop timer
    #define timerStop() clock_gettime(CLOCK_REALTIME,&_T1)

    // Calc elapsed time
    #define timerElapsed() ((_T1.tv_sec - _T0.tv_sec) + ((_T1.tv_nsec - _T0.tv_nsec)*1.0e-9))

    // get current absolute time in sec
    #define timerNow() ( clock_gettime(CLOCK_REALTIME,&_T2)==0?(_T2.tv_sec  + (_T2.tv_nsec*1.0e-9)):0 )

#endif

struct subres2
{
    bool    n;
    string  p;
    bool    q;
    double  r;
    double  s[6];
};

struct subres1
{
    bool    n;
    string  a;
    bool    b;
    double  c;
    double  d[6];
    subres2 e;
};

struct Schema1
{
    string  req1s;
    bool    req2b;
    double  req3n;
    string  req4s;
    bool    req5b;
    double  req6n;
    string  req7s;
    bool    req8b;
    double  req9n;
    string  req10s;
    bool    req11b;
    double  req12n;
    string  opt1s;
    bool    opt2b;
    double  opt3n;
    string  opt4s;
    bool    opt5b;
    double  opt6n;
    string  opt7s;
    bool    opt8b;
    double  opt9n;
    string  opt10s;
    bool    opt11b;
    double  opt12n;
    string  arr1s[10];
    bool    arr2b[10];
    double  arr3n[10];
    subres1 sub0;
    subres1 sub1;
    subres1 sub2;
    subres1 sub3;
    subres1 sub4;
    subres1 sub5;
    subres1 sub6;
    subres1 sub7;
    subres1 sub8;
    subres1 sub9;
};

 // "obj0\":{\"n\":null,\"a\":\"value\",\"b\":true,\"c\":9.999,\"d\":[0,1.5,2,3.5,4,5.5],\"e\":{\"n\":null,\"p\":\"value\",\"q\":false,\"r\":-9.999,\"s\":[0.5,1,2.5,3,4.5,5]}},

void subParse1( const Value::Object& obj, const char * key, subres1 & result )
{
    if ( obj.has( key ) )
    {
        const Value::Object& sub1 = obj.asObject();
        size_t idx;
        Value::ArrayConstIter i;

        result.n = sub1.at( "n" ).isNull();
        result.a = sub1.getString( "a" );
        result.b = sub1.getBool( "b" );
        result.c = sub1.getNumber( "c" );

        const Value::Array& arr = sub1.getArray("d");
        for ( idx = 0, i = arr.begin(); i != arr.end(); i++ )
        {
            result.d[idx++] = (*i).asNumber();
        }

        if ( sub1.has( "e" ) )
        {
            const Value::Object& sub2 = sub1.asObject();
            result.e.n = sub2.at( "n" ).isNull();
            result.e.p = sub2.getString( "p" );
            result.e.q = sub2.getBool( "q" );
            result.e.r = sub2.getNumber( "r" );

            const Value::Array& arr2 = sub2.getArray( "s" );
            for ( idx = 0, i = arr2.begin(); i != arr2.end(); i++ )
            {
                result.e.s[idx++] = (*i).asNumber();
            }
        }
    }
    else
    {
        EXCEPT_PARAM( 1, "MISSING " << key );
    }
}

void parse1( const Value& v, Schema1 & result )
{
    const Value::Object& obj = v.asObject();
    Value::ArrayConstIter i;
    size_t idx;

    result.req1s = obj.getString( "req1s" );
    result.req2b = obj.getBool( "req2b" );
    result.req3n = obj.getNumber( "req3n" );
    result.req4s = obj.getString( "req4s" );
    result.req5b = obj.getBool( "req5b" );
    result.req6n = obj.getNumber( "req6n" );
    result.req7s = obj.getString( "req7s" );
    result.req8b = obj.getBool( "req8b" );
    result.req9n = obj.getNumber( "req9n" );
    result.req10s = obj.getString( "req10s" );
    result.req11b = obj.getBool( "req11b" );
    result.req12n = obj.getNumber( "req12n" );

    if ( obj.has( "opt1s" ) )
        result.req1s = obj.asString();
    else
        EXCEPT( 1, "missing opt" );

    if ( obj.has( "opt2b" ) )
        result.req2b = obj.asBool();
    else
        EXCEPT( 1, "missing opt" );

    if ( obj.has( "opt3n" ) )
        result.req3n = obj.asNumber();
    else
        EXCEPT( 1, "missing opt" );

    if ( obj.has( "opt4s" ) )
        result.req4s = obj.asString();
    else
        EXCEPT( 1, "missing opt" );

    if ( obj.has( "opt5b" ) )
        result.req5b = obj.asBool();
    else
        EXCEPT( 1, "missing opt" );

    if ( obj.has( "opt6n" ) )
        result.req6n = obj.asNumber();
    else
        EXCEPT( 1, "missing opt" );

    if ( obj.has( "opt7s" ) )
        result.req7s = obj.asString();
    else
        EXCEPT( 1, "missing opt" );

    if ( obj.has( "opt8b" ) )
        result.req8b = obj.asBool();
    else
        EXCEPT( 1, "missing opt" );

    if ( obj.has( "opt9n" ) )
        result.req9n = obj.asNumber();
    else
        EXCEPT( 1, "missing opt" );

    if ( obj.has( "opt10s" ) )
        result.req10s = obj.asString();
    else
        EXCEPT( 1, "missing opt" );

    if ( obj.has( "opt11b" ) )
        result.req11b = obj.asBool();
    else
        EXCEPT( 1, "missing opt" );

    if ( obj.has( "opt12n" ) )
        result.req12n = obj.asNumber();
    else
        EXCEPT( 1, "missing opt" );

    if ( obj.has( "arr1s" ) )
    {
        const Value::Array & arr = obj.asArray();
        idx = 0;
        for ( i = arr.begin(); i != arr.end(); i++ )
        {
            result.arr1s[idx++] = (*i).asString();
        }
    }
    else
        EXCEPT( 1, "missing opt" );

    if ( obj.has( "arr2b" ) )
    {
        const Value::Array& arr = obj.asArray();
        idx = 0;
        for ( i = arr.begin(); i != arr.end(); i++ )
        {
            result.arr2b[idx++] = (*i).asBool();
        }
    }
    else
        EXCEPT( 1, "missing opt" );

    if ( obj.has( "arr3n" ) )
    {
        const Value::Array& arr = obj.asArray();
        idx = 0;
        for ( i = arr.begin(); i != arr.end(); i++ )
        {
            result.arr3n[idx++] = (*i).asNumber();
        }
    }
    else
        EXCEPT( 1, "missing opt" );

    subParse1( obj, "obj0", result.sub0 );
    subParse1( obj, "obj1", result.sub1 );
    subParse1( obj, "obj2", result.sub2 );
    subParse1( obj, "obj3", result.sub3 );
    subParse1( obj, "obj4", result.sub4 );
    subParse1( obj, "obj5", result.sub5 );
    subParse1( obj, "obj6", result.sub6 );
    subParse1( obj, "obj7", result.sub7 );
    subParse1( obj, "obj8", result.sub8 );
    subParse1( obj, "obj9", result.sub9 );
}

void perfTest()
{
    string json =
        "{\
            \"req1s\":\"long text long text long text long text long text long text long text long\
            text long text long text long text long text long text long text long text long text\
            text long text long text long text long text long text long text long text long text\
            text long text long text long text long text long text long text long text long text\
            text long text long text long text long text long text long text long text long text\
            text long text long text long text long text long text long text long text long text\
            text long text long text long text long text long text long text long text long text\
            text long text long text long text long text long text long text long text long text\
            text long text long text long text long text long text long text long text long text\
            text long text long text long text long text long text long text long text long text\
            text long text long text long text long text long text long text long text long text\",\
            \"req2b\":true,\
            \"req3n\":-100.5,\
            \"req4s\":\"req4s_val\",\
            \"req5b\":false,\
            \"req6n\":-90.5,\
            \"req7s\":\"short text\",\
            \"req8b\":true,\
            \"req9n\":90.5,\
            \"req10s\":\"text text text text text text text text\",\
            \"req11b\":false,\
            \"req12n\":100.5,\
            \"opt1s\":\"short text\",\
            \"opt2b\":true,\
            \"opt3n\":-100.5,\
            \"opt4s\":\"text text text text text text text text\",\
            \"opt5b\":false,\
            \"opt6n\":-90.5,\
            \"opt7s\":\"short text\",\
            \"opt8b\":true,\
            \"opt9n\":90.5,\
            \"opt10s\":\"text text text text text text text text\",\
            \"opt11b\":false,\
            \"opt12n\":100.5,\
            \"arr1s\":[\"-5\",\"-4\",\"-3\",\"-2\",\"-1\",\"0\",\"1\",\"2\",\"3\",\"4\"],\
            \"arr2b\":[true,false,true,false,true,false,true,false,true,false],\
            \"arr3n\":[-5,-4,-3,-2,-1,0,1,2,3,4],\
            \"obj0\":{\"n\":null,\"a\":\"value\",\"b\":true,\"c\":9.999,\"d\":[0,1.5,2,3.5,4,5.5],\"e\":{\"n\":null,\"p\":\"value\",\"q\":false,\"r\":-9.999,\"s\":[0.5,1,2.5,3,4.5,5]}},\
            \"obj1\":{\"n\":null,\"a\":\"value\",\"b\":true,\"c\":9.999,\"d\":[0,1.5,2,3.5,4,5.5],\"e\":{\"n\":null,\"p\":\"value\",\"q\":false,\"r\":-9.999,\"s\":[0.5,1,2.5,3,4.5,5]}},\
            \"obj2\":{\"n\":null,\"a\":\"value\",\"b\":true,\"c\":9.999,\"d\":[0,1.5,2,3.5,4,5.5],\"e\":{\"n\":null,\"p\":\"value\",\"q\":false,\"r\":-9.999,\"s\":[0.5,1,2.5,3,4.5,5]}},\
            \"obj3\":{\"n\":null,\"a\":\"value\",\"b\":true,\"c\":9.999,\"d\":[0,1.5,2,3.5,4,5.5],\"e\":{\"n\":null,\"p\":\"value\",\"q\":false,\"r\":-9.999,\"s\":[0.5,1,2.5,3,4.5,5]}},\
            \"obj4\":{\"n\":null,\"a\":\"value\",\"b\":true,\"c\":9.999,\"d\":[0,1.5,2,3.5,4,5.5],\"e\":{\"n\":null,\"p\":\"value\",\"q\":false,\"r\":-9.999,\"s\":[0.5,1,2.5,3,4.5,5]}},\
            \"obj5\":{\"n\":null,\"a\":\"value\",\"b\":true,\"c\":9.999,\"d\":[0,1.5,2,3.5,4,5.5],\"e\":{\"n\":null,\"p\":\"value\",\"q\":false,\"r\":-9.999,\"s\":[0.5,1,2.5,3,4.5,5]}},\
            \"obj6\":{\"n\":null,\"a\":\"value\",\"b\":true,\"c\":9.999,\"d\":[0,1.5,2,3.5,4,5.5],\"e\":{\"n\":null,\"p\":\"value\",\"q\":false,\"r\":-9.999,\"s\":[0.5,1,2.5,3,4.5,5]}},\
            \"obj7\":{\"n\":null,\"a\":\"value\",\"b\":true,\"c\":9.999,\"d\":[0,1.5,2,3.5,4,5.5],\"e\":{\"n\":null,\"p\":\"value\",\"q\":false,\"r\":-9.999,\"s\":[0.5,1,2.5,3,4.5,5]}},\
            \"obj8\":{\"n\":null,\"a\":\"value\",\"b\":true,\"c\":9.999,\"d\":[0,1.5,2,3.5,4,5.5],\"e\":{\"n\":null,\"p\":\"value\",\"q\":false,\"r\":-9.999,\"s\":[0.5,1,2.5,3,4.5,5]}},\
            \"obj9\":{\"n\":null,\"a\":\"value\",\"b\":true,\"c\":9.999,\"d\":[0,1.5,2,3.5,4,5.5],\"e\":{\"n\":null,\"p\":\"value\",\"q\":false,\"r\":-9.999,\"s\":[0.5,1,2.5,3,4.5,5]}}\
        }";

    Value v;
    Schema1 result;

    v.fromString( json );
    //cout << "Parsed: " << v.toString() << "\n";
    size_t i, ntest = 10000;
    double elapsed;
    string res;

    timerDef();

    try
    {
        timerStart();

        for ( i = 0; i < ntest; i++ )
        {
            v.fromString( json );
            res = v.toString();
        }

        timerStop();
        elapsed = timerElapsed();

        cout << "Completed " << ntest << " parses in " << elapsed << " sec, " << 1000.0 * elapsed / ntest << " msec per parse\n";

        timerStart();

        for ( i = 0; i < ntest; i++ )
        {
            parse1( v, result );
        }

        timerStop();
        elapsed = timerElapsed();

        cout << "Completed " << ntest << " translations in " << elapsed << " sec, " << 1000.0 * elapsed / ntest << " msec per translation\n";
    }
    catch ( TraceException & e )
    {
        cout << e.toString( true ) << "\n";
    }
}


int main( int argc, char** argv )
{
    cout << "LibJSON Test\n";

    try
    {
        perfTest();
        return 0;
    }
    catch ( TraceException& e )
    {
        cout << "Error: " << e.toString( true ) << "\n";
        return 1;
    }
}
