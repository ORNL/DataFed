#ifndef DATAFED_CORE_URL_BUILDER_HPP
#define DATAFED_CORE_URL_BUILDER_HPP

// Third Party includes
#include <boost/url.hpp>

// Standard includes
#include <string>

namespace datafed {

  class URLBuilder {
    URLBuilder(
        const string & scheme, // i.e. http
        const string & host,   // ip or domain
        const string & port,
        const string & path,
        const std::vector<std::pair<std::string,std::string>> params);

    URLBuilder( const std::string url );

    boost::url::url_view get();
    std::string str();
  };


}

#endif // DATAFED_CORE_URL_BUILDER_HPP
