
// Local private DataFed includes
#include "url_builder.hpp"

// Third Party includes
#include <boost/url.hpp>

// Standard includes
#include <string>

namespace datafed {

  class URLBuilder {
    URLBuilder::URLBuilder(
        const string & scheme, // i.e. http
        const string & authority, // i.e. http
        const string & host,   // ip or domain
        const string & port,
        const string & path,
        const std::vector<std::pair<std::string,std::string>> params) {
    
      m_url.set_scheme(scheme);
      m_url.set_port(port);
    }

    URLBuilder::URLBuilder( const std::string url ) {
      m_url = parse_rui( url ).value();
    }

    boost::url::url_view URLBuilder::get() {
      return m_url;
    }

    std::string URLBuilder::str() {
    }
  };


}

