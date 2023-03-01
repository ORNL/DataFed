#ifndef SERVER_HPP
#define SERVER_HPP
#pragma once

// Local public includes
#include "ServerFactory.hpp"

// Standard includes
#include <chrono>

namespace SDMS {

class IServer {

  public:

    virtual ServerType type() const noexcept = 0;
    /**
     * By default will run forever you can specify a time to run the for instead
     * 
     * std::chrono::duration<double> duration = std::chrono::seconds(1);
     * setRunDuration(duration)
     **/
    virtual void setRunDuration(std::chrono::duration<double> duration) = 0;

    virtual void run() = 0;
};

} // namespace SDMS

#endif // SERVER_HPP
