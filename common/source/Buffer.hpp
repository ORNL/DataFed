#ifndef BUFFER_HPP
#define BUFFER_HPP
#pragma once

// Local public includes
#include "TraceException.hpp"

// Third party includes
#include <google/protobuf/message.h>
#include <google/protobuf/descriptor.h>

// Standard includes
#include <memory>
#include <string>
#include <type_traits>

namespace SDMS {

  const size_t MEGABYTE = 1048576;

  class Buffer {
    private:
      std::unique_ptr<char[]> m_buffer;
      size_t m_size = 0;
      size_t m_max_size = MEGABYTE;
      size_t m_capacity = 0;
    public:

      inline size_t size() const noexcept { return m_size; }
      inline size_t maxSize() const noexcept { return m_max_size; }
      inline size_t capacity() const noexcept { return m_capacity; } 

      inline void reserve(size_t new_capacity) {
        if(new_capacity > m_capacity) {
          if( new_capacity > m_max_size ) {
            EXCEPT(1, "Cannot reserve proposed capacity exceeds max allowable");
          }
          m_buffer.reset();
          if( new_capacity > 0 ) {
            m_buffer = std::move(std::unique_ptr<char[]>(new char[new_capacity]));
          }
          m_capacity = new_capacity;
        }
      }

      const char * get() const { return m_buffer.get(); }

      inline std::string toString() const {
        if( m_size ) {
          return std::string(m_buffer.get(), m_size);  
        }
        return std::string();
      }

      template<typename T>
        friend void copyToBuffer(Buffer &, const T, size_t size );

      /**
       * Assuming you know what you did and the pointer you passed in was
       * allocated correctly, otherwise this will lead to some nasty errors, pray
       * that you never have this problem.
       **/
      template<typename T>
        friend void copyFromBuffer(T , const Buffer &);
  };


  template<typename T>
    inline void copyToBuffer(Buffer & buffer, const T data, size_t size) {
      if(size > 0) {
        buffer.reserve(size);
        if constexpr( std::is_base_of<::google::protobuf::Message,std::remove_pointer_t<T>>::value ) {
          try {
            if ( !data->IsInitialized() ) {
              EXCEPT( 1, "Cannot copy message to buffer it is missing required fields" );
            }
            if ( !data->SerializeToArray( buffer.m_buffer.get(), size )) {
              EXCEPT( 1, "SerializeToArray for message failed." );
            }
          } catch (...) {
            EXCEPT(1, "memcpy failed in buffer for google protobuf message.");
          }
        } else {
          memcpy( buffer.m_buffer.get(), data, size);
        }
      }
      buffer.m_size = size;
    }

  template<typename T>
    inline void copyFromBuffer(T data, const Buffer & buffer) {
      if( buffer.m_size > 0 ) {
        if constexpr( std::is_base_of<::google::protobuf::Message, std::remove_pointer_t<T>>::value ) {
          try {
            data->ParseFromArray( (void *) buffer.m_buffer.get(), buffer.m_size);
          } catch (...) {
            EXCEPT(1, "memcpy failed in buffer.");
          }
        } else {
          memcpy( data, buffer.m_buffer.get(), buffer.m_size);
        }
      }
    }

} // namespace SDMS
#endif // BUFFER_HPP
