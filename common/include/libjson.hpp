#ifndef LIBJSON_HPP
#define LIBJSON_HPP

#include <stdint.h>
#include <math.h>
#include <cstdlib>
#include <vector>
#include <map>
#include <string>
#include "fpconv.h"

namespace libjson{

class Value;


class ParseError
{
public:
    ParseError( const char * a_msg, size_t a_pos ): m_msg( a_msg ), m_pos( a_pos )
    {}

    std::string toString()
    {
        return std::string(m_msg) + " at pos " + std::to_string(m_pos);
    }

    size_t getPos()
    {
        return m_pos;
    }

private:
    void setOffset( size_t a_offset )
    {
        m_pos -= a_offset;
    }

    const char *    m_msg;
    size_t          m_pos;

    friend class Value;
};

#define  ERR_INVALID_CHAR( p ) throw ParseError( "Invalid character", (size_t)p )
#define  ERR_UNTERMINATED_ARRAY( p ) throw ParseError( "Unterminated array", (size_t)p )
#define  ERR_UNTERMINATED_OBJECT( p ) throw ParseError( "Unterminated object", (size_t)p )
#define  ERR_UNTERMINATED_VALUE( p ) throw ParseError( "Unterminated value", (size_t)p )
#define  ERR_EMPTY_KEY( p ) throw ParseError( "Empty key string", (size_t)p )
#define  ERR_INVALID_VALUE( p ) throw ParseError( "Invalid value", (size_t)p )
#define  ERR_INVALID_KEY( p ) throw ParseError( "Invalid key string", (size_t)p )
#define  ERR_INVALID_ESC( p ) throw ParseError( "Invalid escape sequence", (size_t)p )
#define  ERR_INVALID_UNICODE( p ) throw ParseError( "Invalid unicode escape sequence", (size_t)p )


class Value
{
public:
    typedef std::vector<Value> Array;
    typedef std::map<std::string,Value> Object;
    typedef std::string String;
    typedef std::vector<Value>::iterator ArrayIter;
    typedef std::map<std::string,Value>::iterator ObjectIter;

    enum ValueType : uint8_t
    {
        VT_NULL = 0,
        VT_OBJECT,
        VT_ARRAY,
        VT_STRING,
        VT_NUMBER,
        VT_BOOL
    };


    Value() :
        m_type( VT_NULL ), m_value({ 0 })
    {}

    Value( bool a_value ) :
        m_type( VT_BOOL )
    {
        m_value.b = a_value;
    }

    Value( double a_value ) :
        m_type( VT_NUMBER )
    {
        m_value.n = a_value;
    }

    Value( int a_value ) :
        m_type( VT_NUMBER )
    {
        m_value.n = a_value;
    }

    Value( const std::string & a_value ) :
        m_type( VT_STRING )
    {
        m_value.s = new String( a_value );
    }

    Value( const char * a_value ) :
        m_type( VT_STRING )
    {
        m_value.s = new String( a_value );
    }

    Value( const Value & a_source ) = delete;

    Value( Value && a_source ) :
        m_type( a_source.m_type ), m_value( a_source.m_value )
    {
        a_source.m_type = VT_NULL;
        a_source.m_value.o = 0;
    }


    Value( ValueType a_type ) :
        m_type( a_type )
    {
        if ( m_type == VT_OBJECT )
        {
            m_value.o = new Object();
        }
        else if ( m_type == VT_ARRAY )
        {
            m_value.a = new Array();
        }
        else if ( m_type == VT_STRING )
        {
            m_value.s = new String();
        }
        else
        {
            m_value.o = 0;
        }
    }

    ~Value()
    {
        if ( m_type == VT_STRING )
            delete m_value.s;
        else if ( m_type == VT_OBJECT )
            delete m_value.o;
        else if ( m_type == VT_ARRAY )
            delete m_value.a;
    }

    Value &
    operator=( Value && a_source )
    {
        if ( this != &a_source )
        {
            ValueType   type = a_source.m_type;
            ValueUnion  value = a_source.m_value;

            a_source.m_type = VT_NULL;
            a_source.m_value.o = 0;

            this->~Value();

            m_type = type;
            m_value = value;
        }

        return *this;
    }

    Value &
    operator=( Value & a_source )
    {
        if ( this != &a_source )
        {
            ValueType   type = a_source.m_type;
            ValueUnion  value = a_source.m_value;

            a_source.m_type = VT_NULL;
            a_source.m_value.o = 0;

            this->~Value();

            m_type = type;
            m_value = value;
        }

        return *this;
    }

    Value &
    operator=( bool a_value )
    {
        if ( m_type != VT_BOOL )
        {
            this->~Value();
            m_type = VT_BOOL;
            m_value.o = 0;
        }

        m_value.b = a_value;

        return *this;
    }


    Value &
    operator=( double a_value )
    {
        if ( m_type != VT_NUMBER )
        {
            this->~Value();
            m_type = VT_NUMBER;
            m_value.o = 0;
        }

        m_value.n = a_value;

        return *this;
    }

    Value &
    operator=( int a_value )
    {
        if ( m_type != VT_NUMBER )
        {
            this->~Value();
            m_type = VT_NUMBER;
            m_value.o = 0;
        }

        m_value.n = a_value;

        return *this;
    }

    Value &
    operator=( const std::string & a_value )
    {
        if ( m_type != VT_STRING )
        {
            this->~Value();
            m_type = VT_STRING;
            m_value.s = new String( a_value );
        }

        *m_value.s = a_value;

        return *this;
    }

    Value &
    operator=( const char * a_value )
    {
        if ( m_type != VT_STRING )
        {
            this->~Value();
            m_type = VT_STRING;
            m_value.s = new String( a_value );
        }

        *m_value.s = a_value;

        return *this;
    }

    inline ValueType
    getType() const
    {
        return m_type;
    }

    inline bool
    isNull() const
    {
        return m_type == VT_NULL;
    }

    inline bool
    isObject() const
    {
        return m_type == VT_OBJECT;
    }

    inline bool
    isArray() const
    {
        return m_type == VT_ARRAY;
    }

    inline bool
    isString() const
    {
        return m_type == VT_STRING;
    }

    inline bool
    isNumber() const
    {
        return m_type == VT_NUMBER;
    }

    inline bool
    isBool() const
    {
        return m_type == VT_BOOL;
    }

    bool
    asBool()
    {
        if ( m_type == VT_BOOL )
            return m_value.b;
        else if ( m_type == VT_NUMBER )
            return (bool)m_value.n;
        else
            throw std::logic_error("Invalid conversion of Value to bool");
    }

    double
    asNumber()
    {
        if ( m_type == VT_NUMBER )
            return m_value.n;
        else if ( m_type == VT_BOOL )
            return m_value.b?1:0;
        else
            throw std::logic_error("Invalid conversion of Value to number");
    }

    std::string &
    asString()
    {
        if ( m_type == VT_STRING )
            return *m_value.s;
        else
            throw std::logic_error("Invalid conversion of Value to string");
    }

    // ----- Object & Array Methods -----

    size_t
    size() const
    {
        if ( m_type == VT_OBJECT )
            return m_value.o->size();
        else if ( m_type == VT_ARRAY )
            return m_value.a->size();
        else
            throw std::runtime_error("Value::size() requires object or array");
    }


    // ----- Object-only Methods -----

    void
    initObject()
    {
        this->~Value();
        m_type = VT_OBJECT;
        m_value.o = new Object();
    }


    bool
    has( const std::string & a_key ) const
    {
        enforceObjectType();

        return m_value.o->find( a_key ) != m_value.o->end();
    }

    ObjectIter
    find( const std::string & a_key ) const
    {
        enforceObjectType();

        return m_value.o->find( a_key );
    }

    inline ObjectIter
    end() const
    {
        enforceObjectType();

        return m_value.o->end();
    }

    Value &
    operator[]( const std::string & a_key )
    {
        enforceObjectType();

        return (*m_value.o)[a_key];
    }

    void
    erase( const std::string & a_key )
    {
        enforceObjectType();

        m_value.o->erase( a_key );
    }

    Object &
    getObject()
    {
        enforceObjectType();

        return *m_value.o;
    }

    // ----- Array-only Methods -----

    void
    initArray()
    {
        this->~Value();
        m_type = VT_ARRAY;
        m_value.a = new Array();
    }

    Value &
    operator[]( size_t a_index )
    {
        enforceArrayType();

        return (*m_value.a)[a_index];
    }

    void
    push( Value && a_value )
    {
        enforceArrayType();

        m_value.a->push_back( std::move( a_value ));
    }

    void
    pop()
    {
        enforceArrayType();

        m_value.a->pop_back();
    }

    Value &
    back()
    {
        enforceArrayType();

        return m_value.a->back();
    }

    Array &
    getArray()
    {
        enforceArrayType();

        return *m_value.a;
    }

    // ----- To/From String Methods -----

    std::string
    toString() const
    {
        std::string buffer;

        buffer.reserve( 4096 );

        toStringRecurse( buffer );

        return buffer;
    }

    inline void
    fromString( const std::string & a_raw_json )
    {
        fromString( a_raw_json.c_str() );
    }

    void
    fromString( const char * a_raw_json )
    {
        const char *    c = a_raw_json;
        uint8_t         state = PS_SEEK_BEG;

        try
        {
            while ( *c )
            {
                switch ( state )
                {
                case PS_SEEK_BEG:
                    if ( *c == '{' )
                    {
                        c = parseObject( *this, c + 1 );
                        state = PS_SEEK_OBJ_END;
                    }
                    else if ( *c == '[' )
                    {
                        c = parseArray( *this, c + 1 );
                        state = PS_SEEK_ARR_END;
                    }
                    else if ( notWS( *c ))
                        ERR_INVALID_CHAR( c );
                    break;
                case PS_SEEK_OBJ_END:
                    if ( *c == '}' )
                        state = PS_SEEK_END;
                    else if ( notWS( *c ))
                        ERR_INVALID_CHAR( c );
                    break;
                case PS_SEEK_ARR_END:
                    if ( *c == ']' )
                        state = PS_SEEK_END;
                    else if ( notWS( *c ))
                        ERR_INVALID_CHAR( c );
                    break;
                case PS_SEEK_END:
                    if ( notWS( *c ))
                        ERR_INVALID_CHAR( c );
                    break;
                }

                c++;
            }
        }
        catch( ParseError & e )
        {
            e.setOffset( (size_t)a_raw_json );
            throw;
        }
    }


private:
    friend class IObject;
    friend class IArray;

    inline bool notWS( char c ) const
    {
        return !(c == ' ' || c == '\n' || c == '\t' || c == '\r' );
    }

    inline bool isDigit( char c ) const
    {
        return ( c >= '0' && c <= '9' );
    }

/*
    inline bool isHexDigit( char c ) const
    {
        return ( c >= '0' && c <= '9' ) || ( c >= 'A' && c <= 'F' ) || ( c >= 'a' && c <= 'f' );
    }

    inline bool badHexDigit( const char * c ) const
    {
        return !c || !isHexDigit( *c );
    }
*/

    uint8_t toHex( const char * C )
    {
        char c = *C;

        if ( c >= '0' && c <= '9' )
            return c - '0';
        else if ( c >= 'A' && c <= 'F' )
            return 10 + c - 'A';
        else if ( c >= 'a' && c <= 'f' )
            return 10 + c - 'a';
        else
            ERR_INVALID_CHAR( C );
    }

    inline void enforceObjectType() const
    {
        if ( m_type != VT_OBJECT )
            throw std::runtime_error("Value is not an object");
    }

    inline void enforceArrayType() const
    {
        if ( m_type != VT_ARRAY )
            throw std::runtime_error("Value is not an array");
    }

    enum ParseState : uint8_t
    {
        PS_SEEK_BEG,
        PS_SEEK_KEY,
        PS_IN_KEY,
        PS_SEEK_SEP,
        PS_SEEK_VAL,
        PS_IN_VAL_STR,
        PS_IN_VAL_BOOL,
        PS_IN_VAL_NUM,
        PS_NUM_INT,
        PS_NUM_FRAC,
        PS_NUM_EXP,
        PS_SEEK_OBJ_END,
        PS_SEEK_ARR_END,
        PS_SEEK_END,
    };

    ValueType   m_type;

    union ValueUnion
    {
        Object *    o;
        Array *     a;
        bool        b;
        double      n;
        String *    s;
    } m_value;


    void
    toStringRecurse( std::string & a_buffer ) const
    {
        switch( m_type )
        {
        case VT_OBJECT:
            a_buffer.append("{");
            for ( ObjectIter i = m_value.o->begin(); i != m_value.o->end(); i++ )
            {
                if ( i != m_value.o->begin() )
                    a_buffer.append(",\"");
                else
                    a_buffer.append("\"");
                a_buffer.append(i->first);
                a_buffer.append("\":");

                i->second.toStringRecurse( a_buffer );
            }
            a_buffer.append("}");
            break;
        case VT_ARRAY:
            a_buffer.append("[");
            for ( ArrayIter i = m_value.a->begin(); i != m_value.a->end(); i++ )
            {
                if ( i != m_value.a->begin() )
                    a_buffer.append(",");
                i->toStringRecurse( a_buffer );
            }
            a_buffer.append("]");
            break;
        case VT_STRING:
            strToString( a_buffer, *m_value.s );
            break;
        case VT_NUMBER:
            numToString( a_buffer, m_value.n );
            break;
        case VT_BOOL:
            if ( m_value.b )
                a_buffer.append("true");
            else
                a_buffer.append("false");
            break;
        case VT_NULL:
            a_buffer.append("null");
            break;
        }
    }

    inline void
    strToString( std::string & a_buffer, const std::string & a_value ) const
    {
        std::string::const_iterator c = a_value.begin();
        std::string::const_iterator a = c;

        a_buffer.append("\"");
        
        for ( c = a_value.begin(); c != a_value.end(); c++ )
        {
            if ( *c < 0x20 )
            {
                a_buffer.append( a, c );
                a = c + 1;

                switch( *c )
                {
                case '\b':  a_buffer.append( "\\b" ); break;
                case '\f':  a_buffer.append( "\\f" ); break;
                case '\n':  a_buffer.append( "\\n" ); break;
                case '\r':  a_buffer.append( "\\r" ); break;
                case '\t':  a_buffer.append( "\\t" ); break;
                }
            }
            else if ( *c == '\"' )
            {
                a_buffer.append( a, c );
                a_buffer.append( "\\\"" );
                a = c + 1;
            }
            else if ( *c == '\\' )
            {
                a_buffer.append( a, c );
                a_buffer.append( "\\\\" );
                a = c + 1;
            }
        }

        a_buffer.append( a, c );
        a_buffer.append("\"");
    }

    inline void
    numToString( std::string & a_buffer, double a_value ) const
    {
        //a_buffer.append( std::to_string( m_value.n ));
        size_t sz1 = a_buffer.size();
        a_buffer.resize( sz1 + 50 );
        //int sz2 = sprintf( (char *)a_buffer.c_str() + sz1, "%g", m_value.n );
        int sz2 = fpconv_dtoa( a_value, (char *)a_buffer.c_str() + sz1 );
        a_buffer.resize( sz1 + sz2 );
    }

    const char *
    parseObject( Value & a_parent, const char * start )
    {
        //std::cout << "parseObject(" << (size_t)start << ")\n";

        // On function entry, c is next char after '{'

        uint8_t         state = PS_SEEK_KEY;
        const char *    c = start;
        std::string     key;
        //Value           value;

        a_parent.m_type = VT_OBJECT;
        a_parent.m_value.o = new Object();

        while ( *c )
        {
            //std::cout << "po s:" << (int)state << ", val: " << *c << "\n";

            switch ( state )
            {
            case PS_SEEK_KEY:
                if ( *c == '"' )
                {
                    c = parseString( key, c + 1 );

                    if ( !key.size() )
                        ERR_INVALID_KEY( c );

                    state = PS_SEEK_SEP;
                }
                else if ( notWS( *c ))
                    ERR_INVALID_CHAR( c );
                break;
            case PS_SEEK_SEP:
                if ( *c == ':' )
                    state = PS_SEEK_VAL;
                else if ( notWS( *c ))
                    ERR_INVALID_CHAR( c );
                break;
            case PS_SEEK_VAL:
                if ( notWS( *c ))
                {
                    c = parseValue( (*a_parent.m_value.o)[key], c );
                    state = PS_SEEK_OBJ_END;
                }
                break;

            case PS_SEEK_OBJ_END:
                if ( *c == ',' )
                    state = PS_SEEK_KEY;
                else if ( *c == '}' )
                    return c;
                else if ( notWS( *c ))
                    ERR_INVALID_CHAR( c );
                break;
            }

            c++;
        }

        ERR_UNTERMINATED_OBJECT( start );
    }

    const char *
    parseArray( Value & a_parent, const char * start )
    {
        //std::cout << "parseArray(" << (size_t)start << ")\n";

        // On function entry, c is next char after '['
        const char *    c = start;
        uint8_t         state = PS_SEEK_VAL;
        Value           value;

        a_parent.m_type = VT_ARRAY;
        a_parent.m_value.a = new Array();
        a_parent.m_value.a->reserve( 20 );

        while ( *c )
        {
            //std::cout << "pa s:" << (int)state << ", val: " << *c << "\n";

            switch ( state )
            {
            case PS_SEEK_VAL:
                if ( notWS( *c ))
                {
                    c = parseValue( value, c );
                    a_parent.m_value.a->push_back( std::move( value ));
                    state = PS_SEEK_SEP;
                }
                break;
            case PS_SEEK_SEP:
                if ( *c == ',' )
                    state = PS_SEEK_VAL;
                else if ( *c == ']' )
                    // TODO Attach array to parent
                    return c;
                else if ( notWS( *c ))
                    ERR_INVALID_CHAR( c );
                break;
            }

            c++;
        }

        ERR_UNTERMINATED_ARRAY( start );
    }

    inline const char *
    parseValue( Value & a_value, const char * start )
    {
        //std::cout << "parseValue(" << (size_t)start << ")\n";

        const char *    c = start;
        //uint8_t         state = PS_SEEK_VAL;

        while ( *c )
        {
            //std::cout << "pv val: " << *c << "\n";

            switch ( *c )
            {
            case '{':
                c = parseObject( a_value, c + 1 );
                return c;
            case '[':
                c = parseArray( a_value, c + 1 );
                return c;
            case '"':
                a_value.m_type = VT_STRING;
                a_value.m_value.s = new String();
                c = parseString( *a_value.m_value.s, c + 1 );
                return c;
            case 't':
                if ( *(c+1) == 'r' && *(c+2) == 'u' && *(c+3) == 'e' )
                {
                    a_value.m_type = VT_BOOL;
                    a_value.m_value.b = true;
                    c += 3;
                    return c;
                }
                else
                    ERR_INVALID_VALUE( c );
                break;
            case 'f':
                if ( *(c+1) == 'a' && *(c+2) == 'l' && *(c+3) == 's' && *(c+4) == 'e' )
                {
                    a_value.m_type = VT_BOOL;
                    a_value.m_value.b = false;
                    c += 4;
                    return c;
                }
                else
                    ERR_INVALID_VALUE( c );
                break;
            case 'n':
                if ( *(c+1) == 'u' && *(c+2) == 'l' && *(c+3) == 'l' )
                {
                    a_value.m_type = VT_NULL;
                    c += 3;
                    return c;
                }
                else
                    ERR_INVALID_VALUE( c );
                break;
            default:
                if ( *c == '-' || isDigit( *c ) || *c == '.' )
                {
                    a_value.m_type = VT_NUMBER;
                    c = parseNumber( a_value.m_value.n, c );
                    return c;
                }
                else if ( notWS( *c ))
                    ERR_INVALID_CHAR( c );
                break;
            }

            c++;
        }

        ERR_UNTERMINATED_VALUE( start );
    }

    inline const char *
    parseString( std::string & a_value, const char * start )
    {
        //std::cout << "parseString(" << (size_t)start << ")\n";

        // On entry, c is next char after "
        const char *    c = start;
        const char *    a = start;
        uint32_t        utf8;

        a_value.clear();

        while ( *c )
        {
            //std::cout << "ps val: " << (int)(*c) << "\n";

            if ( *c == '\\' )
            {
                if ( c != a )
                    a_value.append( a, c - a );

                switch ( *(c+1) )
                {
                    case 'b':  a_value.append( "\b" ); break;
                    case 'f':  a_value.append( "\f" ); break;
                    case 'n':  a_value.append( "\n" ); break;
                    case 'r':  a_value.append( "\r" ); break;
                    case 't':  a_value.append( "\t" ); break;
                    case '/':  a_value.append( "/" ); break;
                    case '"':  a_value.append( "\"" ); break;
                    case '\\':  a_value.append( "\\" ); break;
                    case 'u':
                        utf8 = ( toHex( c + 2 ) << 12 ) | ( toHex( c + 3 ) << 8 ) | ( toHex( c + 4 ) << 4 ) | toHex( c + 5 );
                        //std::cout << "hex: " << std::hex << utf8 << std::dec << "\n";

                        if ( utf8 < 0x80 )
                            a_value.append( 1, (char) utf8 );
                        else if ( utf8 < 0x800 )
                        {
                            a_value.append( 1, (char)( 0xC0 | ( utf8 >> 6 )) );
                            a_value.append( 1, (char)( 0x80 | ( utf8 & 0x3F )) );
                        }
                        else if ( utf8 < 0x10000 )
                        {
                            a_value.append( 1, (char)( 0xE0 | ( utf8 >> 12 )) );
                            a_value.append( 1, (char)( 0x80 | (( utf8 >> 6 ) & 0x3F )) );
                            a_value.append( 1, (char)( 0x80 | ( utf8 & 0x3F )) );
                        }
                        else if ( utf8 < 0x110000 )
                        {
                            a_value.append( 1, (char)( 0xF0 | ( utf8 >> 18 )) );
                            a_value.append( 1, (char)( 0x80 | (( utf8 >> 12 ) & 0x3F )) );
                            a_value.append( 1, (char)( 0x80 | (( utf8 >> 6 ) & 0x3F )) );
                            a_value.append( 1, (char)( 0x80 | ( utf8 & 0x3F )) );
                        }
                        else
                            ERR_INVALID_UNICODE( c );

                        c += 4;
                        break;
                    default:
                        ERR_INVALID_CHAR( c );
                }

                c++;
                a = c + 1;
            }
            else if ( *c == '"' )
            {
                if ( c != a )
                    a_value.append( a, c - a );
                return c;
            }
            else if ( *c >= 0 && *c < 0x20 )
            {
                ERR_INVALID_CHAR( c );
            }

            c++;
        }

        ERR_UNTERMINATED_VALUE( start );
    }

    inline const char *
    parseNumber( double & a_value, const char * start )
    {
        //std::cout << "parseNumber(" << (size_t)start << ")\n";
        char *end;
        a_value = strtod( start, &end );
        //std::cout << "end: " << *end << "\n";
        return end-1;
#if 0
        const char *c = start;
        uint64_t    mant = 0; //, fracp = 0;
        uint32_t    dp = 0, expp = 0; //, flen = 0;
        bool        exp_neg = false, val_neg = false;
        int state = 0;
        bool stop = false;

        if ( *c == '-' )
        {
            val_neg = true;
            c++;
        }

        // mantisa (required)
        while ( *c )
        {
            //std::cout << "pn, val:" << *c << "\n";

            switch ( state )
            {
            case 0: // Before decimal point
                if ( *c == '.' )
                {
                    dp = (c - start) - (val_neg?1:0);
                    state = 1;
                    break;
                }
                // Fall through
            case 1:
                if ( mant == 0 && *c == '0' ) // Ignore leading zeros
                {
                }
                else if ( *c >= '0' && *c <= '9' )
                {
                    mant *= 10;
                    mant += (*c) - '0';
                    //std::cout << "intp: " << intp << "\n";
                }
                else if ( *c == 'e' || *c =='E' )
                {
                    if ( *(c+1) == '+' )
                        c++;
                    else if ( *(c+1) == '-' )
                    {
                        exp_neg = true;
                        c++;
                    }
                    state = 2;
                }
                else
                    stop = true;
                break;
            case 2: // Exponent
                if ( *c >= '0' && *c <= '9' )
                {
                    expp *= 10;
                    expp += (*c) - '0';
                }
                else
                    stop = true;
                break;
            }

            if ( stop )
                break;

            c++;
        }

        if ( *c )
        {
            std::cout << "mant: " << mant << ", dp: " << dp << ", expp: " << expp << "\n";


            return c - 1;
        }
        else
            ERR_UNTERMINATED_VALUE( start );

#endif
    }

};

}

#endif
