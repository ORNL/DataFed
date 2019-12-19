#ifndef TRACEEXCEPTION_HPP
#define TRACEEXCEPTION_HPP

#include <sstream>

#define EXCEPT(err_code,msg) throw TraceException( __FUNCTION__, __LINE__, err_code, msg )

#define EXCEPT_PARAM(err_code,msg) do{ \
    std::stringstream _trace_excep_sstr; \
    _trace_excep_sstr << msg; \
    throw TraceException( __FUNCTION__, __LINE__, err_code, _trace_excep_sstr.str()); \
}while(0)

#define EXCEPT_CONTEXT(e,msg) \
{ \
    std::stringstream _trace_excep_sstr; \
    _trace_excep_sstr << msg; \
    e.addContext( _trace_excep_sstr.str()); \
}


class TraceException : public std::exception
{
public:
    TraceException( const char *a_file, unsigned long a_line, unsigned long a_error_code, const std::string & a_context )
        : m_file(a_file), m_line(a_line), m_error_code(a_error_code), m_context(a_context)
    {}

    virtual ~TraceException() {}

    void addContext( const std::string & a_context )
    {
        if ( a_context.size() )
        {
            m_context = a_context + "\n" + m_context;
        }
    }

    std::string toString( bool debug = false ) const
    {
        if ( debug )
        {
            std::stringstream sstr;
            sstr << m_context << std::endl;
            sstr << "(source: " << m_file << ":" << m_line << " code:" << m_error_code << ")" << std::endl;

            return sstr.str();
        }
        else
            return m_context;
    }

    unsigned long getErrorCode()
    {
        return m_error_code;
    }

    const char* what() const throw ()
    {
        return m_context.c_str();
    }

private:
    const char         *m_file;
    unsigned long       m_line;
    unsigned long       m_error_code;
    std::string         m_context;
};

#define RAPIDJSON_ASSERT(x) if (!(x)) throw TraceException(__FUNCTION__, __LINE__,0,RAPIDJSON_STRINGIFY(x))

#endif // TRACEEXCEPTION_H
