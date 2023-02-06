#ifndef IIDENTITYMAP_HPP
#define IIDENTITYMAP_HPP
#pragma once

#include <string>

class IIdentityMap
{
public:
    virtual bool hasKey( const std::string & public_key) const noexcept = 0;
    virtual std::string getId( const std::string & public_key) const noexcept = 0;
};

#endif // IDENTITYMAP
