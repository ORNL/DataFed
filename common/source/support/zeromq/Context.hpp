#ifndef ZMQCONTEXT_HPP
#define ZMQCONTEXT_HPP
#pragma once

// Third party includes
#include <zmq.hpp>

// Standard library includes
#include <atomic>
#include <iostream>

namespace SDMS {


class InprocContext {
public:
    static int get() {
        return counter.load();
    }

    static void increment() {
        counter++;
    }

    static void decrement() {
        counter--;
    }

    static void *getContext() {
      if (context == nullptr) {
        context = zmq_ctx_new();
      }
      return context;
    }

    static int resetContext() {
      int rc = 0;
      if (context != nullptr) {
        std::cout << "Terminating and resetting context" << std::endl;
        rc = zmq_ctx_term(context);
        // zmq_ctx_destroy(context); // Consider if you need this (deprecated)
        context = nullptr;
      } else {
        std::cout << "Context is already null" << std::endl;
      }
      return rc;
    }

private:
    inline static std::atomic<int> counter = 0;
    inline static void *context = nullptr;
};

} // namespace SDMS

#endif // ZMQCONTEXT_HPP
