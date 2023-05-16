#ifndef ZMQCONTEXT_HPP
#define ZMQCONTEXT_HPP
#pragma once

// Third party includes
#include <zmq.hpp>

namespace SDMS {
/**
 * Singleton Pattern for Security Context of zmq.
 **/
inline void* getContext() {
  static void* context = zmq_ctx_new();
  return context;
}
}  // namespace SDMS

#endif  // ZMQCONTEXT_HPP
