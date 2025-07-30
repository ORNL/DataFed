#ifndef LIBJSON_HPP
#define LIBJSON_HPP

#include "TraceException.hpp"
#include "fpconv.h"
#include <cstdlib>
#include <map>
#include <math.h>
#include <stdint.h>
#include <string>
#include <vector>

namespace libjson {

class Value;

class ParseError //: public std::exception
{
public:
  ParseError(const char *a_msg, size_t a_pos) : m_msg(a_msg), m_pos(a_pos) {}

  std::string toString() {
    return std::string(m_msg) + " at pos " + std::to_string(m_pos);
  }

  size_t getPos() { return m_pos; }

private:
  void setOffset(size_t a_offset) { m_pos -= a_offset; }

  const char *m_msg;
  size_t m_pos;

  friend class Value;
};

#define ERR_INVALID_CHAR(p) throw ParseError("Invalid character", (size_t)p)
#define ERR_UNTERMINATED_ARRAY(p)                                              \
  throw ParseError("Unterminated array", (size_t)p)
#define ERR_UNTERMINATED_OBJECT(p)                                             \
  throw ParseError("Unterminated object", (size_t)p)
#define ERR_UNTERMINATED_VALUE(p)                                              \
  throw ParseError("Unterminated value", (size_t)p)
#define ERR_EMPTY_KEY(p) throw ParseError("Empty key string", (size_t)p)
#define ERR_INVALID_VALUE(p) throw ParseError("Invalid value", (size_t)p)
#define ERR_INVALID_KEY(p) throw ParseError("Invalid key string", (size_t)p)
#define ERR_INVALID_ESC(p)                                                     \
  throw ParseError("Invalid escape sequence", (size_t)p)
#define ERR_INVALID_UNICODE(p)                                                 \
  throw ParseError("Invalid unicode escape sequence", (size_t)p)

class Value {
public:
  typedef std::map<std::string, Value>::iterator ObjectIter;
  typedef std::map<std::string, Value>::const_iterator ObjectConstIter;
  typedef std::vector<Value> Array;
  typedef std::string String;
  typedef std::vector<Value>::iterator ArrayIter;
  typedef std::vector<Value>::const_iterator ArrayConstIter;

  enum ValueType : uint8_t {
    VT_NULL = 0,
    VT_OBJECT,
    VT_ARRAY,
    VT_STRING,
    VT_NUMBER,
    VT_BOOL
  };

  /**
   * @class Object
   * @brief Provides a wrapper around underlying map to provide helper methods
   */
  class Object {
  public:
    Object() { m_iter = m_map.end(); }

    ~Object() {}

    inline size_t size() { return m_map.size(); }

    inline void clear() {
      m_map.clear();
      m_iter = m_map.end();
    }

    // The following methods look-up a value from key and attempt to return a
    // specific type

    Value &getValue(const std::string &a_key) {
      ObjectIter iter = m_map.find(a_key);

      if (iter == m_map.end())
        EXCEPT_PARAM(1, "Key not foundA: " << a_key);

      return (Value &)iter->second;
    }

    const Value &getValue(const std::string &a_key) const {
      ObjectConstIter iter = m_map.find(a_key);

      if (iter == m_map.end())
        EXCEPT_PARAM(1, "Key not foundB: " << a_key);

      return iter->second;
    }

    Object &getObject(const std::string &a_key) {
      ObjectIter iter = m_map.find(a_key);

      if (iter == m_map.end())
        EXCEPT_PARAM(1, "Key not foundC: " << a_key);

      if (iter->second.m_type == VT_OBJECT)
        return (Object &)*iter->second.m_value.o;

      EXCEPT_PARAM(1, "Invalid conversion of " << iter->second.getTypeString()
                                               << " value to object for key "
                                               << a_key);
    }

    const Object &getObject(const std::string &a_key) const {
      ObjectConstIter iter = m_map.find(a_key);

      if (iter == m_map.end())
        EXCEPT_PARAM(1, "Key not foundD: " << a_key);

      if (iter->second.m_type == VT_OBJECT)
        return (const Object &)*iter->second.m_value.o;

      EXCEPT_PARAM(1, "Invalid conversion of " << iter->second.getTypeString()
                                               << " value to object for key "
                                               << a_key);
    }

    Array &getArray(const std::string &a_key) {
      ObjectIter iter = m_map.find(a_key);

      if (iter == m_map.end())
        EXCEPT_PARAM(1, "Key not foundE: " << a_key);

      if (iter->second.m_type == VT_ARRAY)
        return *iter->second.m_value.a;

      EXCEPT_PARAM(1, "Invalid conversion of " << iter->second.getTypeString()
                                               << " value to array for key "
                                               << a_key);
    }

    const Array &getArray(const std::string &a_key) const {
      ObjectConstIter iter = m_map.find(a_key);

      if (iter == m_map.end())
        EXCEPT_PARAM(1, "Key not foundF: " << a_key);

      if (iter->second.m_type == VT_ARRAY)
        return *iter->second.m_value.a;

      EXCEPT_PARAM(1, "Invalid conversion of " << iter->second.getTypeString()
                                               << " value to array for key "
                                               << a_key);
    }

    bool getBool(const std::string &a_key) const {
      ObjectConstIter iter = m_map.find(a_key);

      if (iter == m_map.end())
        EXCEPT_PARAM(1, "Key not foundG: " << a_key);

      if (iter->second.m_type == VT_BOOL)
        return iter->second.m_value.b;
      else if (iter->second.m_type == VT_NUMBER)
        return (bool)iter->second.m_value.n;

      EXCEPT_PARAM(1, "Invalid conversion of " << iter->second.getTypeString()
                                               << " value to boolean for key "
                                               << a_key);
    }

    double getNumber(const std::string &a_key) const {
      ObjectConstIter iter = m_map.find(a_key);

      if (iter == m_map.end())
        EXCEPT_PARAM(1, "Key not foundH: " << a_key);

      if (iter->second.m_type == VT_NUMBER)
        return iter->second.m_value.n;
      else if (iter->second.m_type == VT_BOOL)
        return iter->second.m_value.b ? 1 : 0;

      EXCEPT_PARAM(1, "Invalid conversion of " << iter->second.getTypeString()
                                               << " value to number for key "
                                               << a_key);
    }

    const std::string &getString(const std::string &a_key) const {
      ObjectConstIter iter = m_map.find(a_key);

      if (iter == m_map.end())
        EXCEPT_PARAM(1, "Key not foundI: " << a_key);

      if (iter->second.m_type == VT_STRING)
        return *iter->second.m_value.s;

      EXCEPT_PARAM(1, "Invalid conversion of " << iter->second.getTypeString()
                                               << " value to string for key "
                                               << a_key);
    }

    std::string &getString(const std::string &a_key) {
      ObjectIter iter = m_map.find(a_key);

      if (iter == m_map.end())
        EXCEPT_PARAM(1, "Key not foundJ: " << a_key);

      if (iter->second.m_type == VT_STRING)
        return *iter->second.m_value.s;

      EXCEPT_PARAM(1, "Invalid conversion of " << iter->second.getTypeString()
                                               << " value to string for key "
                                               << a_key);
    }

    // Checks if key is present, sets internal iterator to entry

    inline bool has(const std::string &a_key) const {
      return (m_iter = m_map.find(a_key)) != m_map.end();
    }

    // The following methods can be called after has() (sets internal iterator
    // to entry)

    Value &value() {
      if (m_iter == m_map.end())
        EXCEPT(1, "Key not set");

      return (Value &)m_iter->second;
    }

    const Value &value() const {
      if (m_iter == m_map.end())
        EXCEPT(1, "Key not set");

      return m_iter->second;
    }

    std::string &asString() {
      if (m_iter == m_map.end())
        EXCEPT(1, "Key not set");

      if (m_iter->second.m_type == VT_STRING)
        return *m_iter->second.m_value.s;

      EXCEPT_PARAM(1, "Invalid conversion of " << m_iter->second.getTypeString()
                                               << " value to string for key "
                                               << m_iter->first);
    }

    const std::string &asString() const {
      if (m_iter == m_map.end())
        EXCEPT(1, "Key not set");

      if (m_iter->second.m_type == VT_STRING)
        return *m_iter->second.m_value.s;

      EXCEPT_PARAM(1, "Invalid conversion of " << m_iter->second.getTypeString()
                                               << " value to string for key "
                                               << m_iter->first);
    }

    double asNumber() const {
      if (m_iter == m_map.end())
        EXCEPT(1, "No key set");

      if (m_iter->second.m_type == VT_NUMBER)
        return m_iter->second.m_value.n;
      else if (m_iter->second.m_type == VT_BOOL)
        return m_iter->second.m_value.b ? 1 : 0;

      EXCEPT_PARAM(1, "Invalid conversion of " << m_iter->second.getTypeString()
                                               << " value to number for key "
                                               << m_iter->first);
    }

    bool asBool() const {
      if (m_iter == m_map.end())
        EXCEPT(1, "Key not set");

      if (m_iter->second.m_type == VT_BOOL)
        return m_iter->second.m_value.b;
      else if (m_iter->second.m_type == VT_NUMBER)
        return (bool)m_iter->second.m_value.n;

      EXCEPT_PARAM(1, "Invalid conversion of " << m_iter->second.getTypeString()
                                               << " value to boolean for key "
                                               << m_iter->first);
    }

    Object &asObject() {
      if (m_iter == m_map.end())
        EXCEPT(1, "Key not set");

      if (m_iter->second.m_type == VT_OBJECT)
        return *m_iter->second.m_value.o;

      EXCEPT_PARAM(1, "Invalid conversion of " << m_iter->second.getTypeString()
                                               << " value to object for key "
                                               << m_iter->first);
    }

    const Object &asObject() const {
      if (m_iter == m_map.end())
        EXCEPT(1, "Key not set");

      if (m_iter->second.m_type == VT_OBJECT)
        return *m_iter->second.m_value.o;

      EXCEPT_PARAM(1, "Invalid conversion of " << m_iter->second.getTypeString()
                                               << " value to object for key "
                                               << m_iter->first);
    }

    Array &asArray() {
      if (m_iter == m_map.end())
        EXCEPT(1, "Key not set");

      if (m_iter->second.m_type == VT_ARRAY)
        return *m_iter->second.m_value.a;

      EXCEPT_PARAM(1, "Invalid conversion of " << m_iter->second.getTypeString()
                                               << " value to array for key "
                                               << m_iter->first);
    }

    const Array &asArray() const {
      if (m_iter == m_map.end())
        EXCEPT(1, "Key not set");

      if (m_iter->second.m_type == VT_ARRAY)
        return *m_iter->second.m_value.a;

      EXCEPT_PARAM(1, "Invalid conversion of " << m_iter->second.getTypeString()
                                               << " value to array for key "
                                               << m_iter->first);
    }

    // The following methods provide a lower-level map-like interface

    inline ObjectIter find(const std::string &a_key) {
      return m_map.find(a_key);
    }

    inline ObjectConstIter find(const std::string &a_key) const {
      return m_map.find(a_key);
    }

    inline ObjectIter begin() { return m_map.begin(); }

    inline ObjectConstIter begin() const { return m_map.begin(); }

    inline ObjectIter end() { return m_map.end(); }

    inline ObjectConstIter end() const { return m_map.end(); }

    Value &operator[](const std::string &a_key) { return m_map[a_key]; }

    Value &at(const std::string &a_key) {
      ObjectIter iter = m_map.find(a_key);
      if (iter != m_map.end())
        return iter->second;

      EXCEPT_PARAM(1, "Key " << a_key << " not present");
    }

    const Value &at(const std::string &a_key) const {
      ObjectConstIter iter = m_map.find(a_key);
      if (iter != m_map.end())
        return iter->second;

      EXCEPT_PARAM(1, "Key " << a_key << " not present");
    }

    void erase(const std::string &a_key) { m_map.erase(a_key); }

  private:
    std::map<std::string, Value> m_map;
    mutable ObjectConstIter m_iter;
  };

  Value() : m_type(VT_NULL), m_value({0}) {}

  explicit Value(bool a_value) : m_type(VT_BOOL) { m_value.b = a_value; }

  explicit Value(double a_value) : m_type(VT_NUMBER) { m_value.n = a_value; }

  explicit Value(int a_value) : m_type(VT_NUMBER) { m_value.n = a_value; }

  explicit Value(const std::string &a_value) : m_type(VT_STRING) {
    m_value.s = new String(a_value);
  }

  explicit Value(const char *a_value) : m_type(VT_STRING) {
    m_value.s = new String(a_value);
  }

  Value(const Value &a_source) = delete;

  Value(Value &&a_source) : m_type(a_source.m_type), m_value(a_source.m_value) {
    a_source.m_type = VT_NULL;
    a_source.m_value.o = 0;
  }

  explicit Value(ValueType a_type) : m_type(a_type) {
    if (m_type == VT_OBJECT) {
      m_value.o = new Object();
    } else if (m_type == VT_ARRAY) {
      m_value.a = new Array();
    } else if (m_type == VT_STRING) {
      m_value.s = new String();
    } else {
      m_value.o = 0;
    }
  }

  ~Value() {
    if (m_type == VT_STRING)
      delete m_value.s;
    else if (m_type == VT_OBJECT)
      delete m_value.o;
    else if (m_type == VT_ARRAY)
      delete m_value.a;
  }

  Value &operator=(Value &&a_source) {
    if (this != &a_source) {
      ValueType type = a_source.m_type;
      ValueUnion value = a_source.m_value;

      a_source.m_type = VT_NULL;
      a_source.m_value.o = 0;

      this->~Value();

      m_type = type;
      m_value = value;
    }

    return *this;
  }

  Value &operator=(Value &a_source) {
    if (this != &a_source) {
      ValueType type = a_source.m_type;
      ValueUnion value = a_source.m_value;

      a_source.m_type = VT_NULL;
      a_source.m_value.o = 0;

      this->~Value();

      m_type = type;
      m_value = value;
    }

    return *this;
  }

  Value &operator=(bool a_value) {
    if (m_type != VT_BOOL) {
      this->~Value();
      m_type = VT_BOOL;
      m_value.o = 0;
    }

    m_value.b = a_value;

    return *this;
  }

  Value &operator=(double a_value) {
    if (m_type != VT_NUMBER) {
      this->~Value();
      m_type = VT_NUMBER;
      m_value.o = 0;
    }

    m_value.n = a_value;

    return *this;
  }

  Value &operator=(int a_value) {
    if (m_type != VT_NUMBER) {
      this->~Value();
      m_type = VT_NUMBER;
      m_value.o = 0;
    }

    m_value.n = a_value;

    return *this;
  }

  Value &operator=(size_t a_value) {
    if (m_type != VT_NUMBER) {
      this->~Value();
      m_type = VT_NUMBER;
      m_value.o = 0;
    }

    m_value.n = a_value;

    return *this;
  }

  Value &operator=(const std::string &a_value) {
    if (m_type != VT_STRING) {
      this->~Value();
      m_type = VT_STRING;
      m_value.s = new String(a_value);
    }

    *m_value.s = a_value;

    return *this;
  }

  Value &operator=(const char *a_value) {
    if (m_type != VT_STRING) {
      this->~Value();
      m_type = VT_STRING;
      m_value.s = new String(a_value);
    }

    *m_value.s = a_value;

    return *this;
  }

  inline ValueType getType() const { return m_type; }

  const char *getTypeString() const {
    switch (m_type) {
    case VT_NULL:
      return "NULL";
    case VT_OBJECT:
      return "OBJECT";
    case VT_ARRAY:
      return "ARRAY";
    case VT_STRING:
      return "STRING";
    case VT_NUMBER:
      return "NUMBER";
    case VT_BOOL:
      return "BOOL";
    default:
      return "INVALID";
    }
  }

  inline bool isNull() const { return m_type == VT_NULL; }

  inline bool isObject() const { return m_type == VT_OBJECT; }

  inline bool isArray() const { return m_type == VT_ARRAY; }

  inline bool isString() const { return m_type == VT_STRING; }

  inline bool isNumber() const { return m_type == VT_NUMBER; }

  inline bool isBool() const { return m_type == VT_BOOL; }

  bool asBool() const {
    if (m_type == VT_BOOL)
      return m_value.b;
    else if (m_type == VT_NUMBER)
      return (bool)m_value.n;

    EXCEPT_PARAM(1, "Invalid conversion of " << getTypeString()
                                             << " value to boolean");
  }

  static bool asBool(const std::map<std::string, Value>::const_iterator &iter) {
    const Value &val = iter->second;

    if (val.m_type == VT_BOOL)
      return val.m_value.b;
    else if (val.m_type == VT_NUMBER)
      return (bool)val.m_value.n;

    EXCEPT_PARAM(1, "Invalid conversion of " << val.getTypeString()
                                             << " value to boolean for key "
                                             << iter->first);
  }

  double asNumber() const {
    if (m_type == VT_NUMBER)
      return m_value.n;
    else if (m_type == VT_BOOL)
      return m_value.b ? 1 : 0;

    EXCEPT_PARAM(1, "Invalid conversion of " << getTypeString()
                                             << " value to number");
  }

  std::string &asString() {
    if (m_type == VT_STRING)
      return *m_value.s;

    EXCEPT_PARAM(1, "Invalid conversion of " << getTypeString()
                                             << " value to string");
  }

  const std::string &asString() const {
    if (m_type == VT_STRING)
      return *m_value.s;

    EXCEPT_PARAM(1, "Invalid conversion of " << getTypeString()
                                             << " value to string");
  }

  static std::string &
  asString(const std::map<std::string, Value>::const_iterator &iter) {
    const Value &val = iter->second;

    if (val.m_type == VT_STRING)
      return *val.m_value.s;

    EXCEPT_PARAM(1, "Invalid conversion of " << val.getTypeString()
                                             << " value to string for key "
                                             << iter->first);
  }

  static const std::string &
  asStringConst(const std::map<std::string, Value>::const_iterator &iter) {
    const Value &val = iter->second;

    if (val.m_type == VT_STRING)
      return *val.m_value.s;

    EXCEPT_PARAM(1, "Invalid conversion of " << val.getTypeString()
                                             << " value to string for key "
                                             << iter->first);
  }

  // ----- Object & Array Methods -----

  size_t size() const {
    if (m_type == VT_OBJECT)
      return m_value.o->size();
    else if (m_type == VT_ARRAY)
      return m_value.a->size();

    EXCEPT(1, "Value::size() requires object or array type");
  }

  void clear() {
    if (m_type == VT_OBJECT)
      m_value.o->clear();
    else if (m_type == VT_ARRAY)
      m_value.a->clear();
    else
      m_value.o = 0;
  }

  // ----- Object-only Methods -----

  Object &initObject() {
    this->~Value();
    m_type = VT_OBJECT;
    m_value.o = new Object();

    return *m_value.o;
  }

  Object &asObject() {
    if (m_type != VT_OBJECT) {
      std::string error_msg = "Value is not an object, it is instead of type: ";
      error_msg += getTypeString();
      EXCEPT(1, error_msg);
    }
    return *m_value.o;
  }

  const Object &asObject() const {
    if (m_type != VT_OBJECT) {
      std::string error_msg = "Value is not an object, it is instead of type: ";
      error_msg += getTypeString();
      EXCEPT(1, error_msg);
    }
    return *m_value.o;
  }

  // ----- Array-only Methods -----

  Array &initArray() {
    this->~Value();
    m_type = VT_ARRAY;
    m_value.a = new Array();

    return *m_value.a;
  }

  Array &asArray() {
    if (m_type != VT_ARRAY) {
      std::string error_msg = "Value is not an array, it is instead of type: ";
      error_msg += getTypeString();
      EXCEPT(1, error_msg);
    }

    return *m_value.a;
  }

  const Array &asArray() const {
    if (m_type != VT_ARRAY) {
      std::string error_msg = "Value is not an array, it is instead of type: ";
      error_msg += getTypeString();
      EXCEPT(1, error_msg);
    }

    return *m_value.a;
  }

  // ----- To/From String Methods -----

  std::string toString() const {
    std::string buffer;

    buffer.reserve(4096);

    toStringRecurse(buffer);

    return buffer;
  }

  inline void fromString(const std::string &a_raw_json) {
    fromString(a_raw_json.c_str());
  }

  void fromString(const char *a_raw_json) {
    if (m_type != VT_NULL) {
      this->~Value();
      m_type = VT_NULL;
      m_value.o = 0;
    }

    const char *c = a_raw_json;
    uint8_t state = PS_SEEK_BEG;

    try {
      while (*c) {
        switch (state) {
        case PS_SEEK_BEG:
          if (*c == '{') {
            c = parseObject(*this, c + 1);
            state = PS_SEEK_OBJ_END;
          } else if (*c == '[') {
            c = parseArray(*this, c + 1);
            state = PS_SEEK_ARR_END;
          } else if (notWS(*c))
            ERR_INVALID_CHAR(c);
          break;
        case PS_SEEK_OBJ_END:
          if (*c == '}')
            state = PS_SEEK_END;
          else if (notWS(*c))
            ERR_INVALID_CHAR(c);
          break;
        case PS_SEEK_ARR_END:
          if (*c == ']')
            state = PS_SEEK_END;
          else if (notWS(*c))
            ERR_INVALID_CHAR(c);
          break;
        case PS_SEEK_END:
          if (notWS(*c))
            ERR_INVALID_CHAR(c);
          break;
        }

        c++;
      }
    } catch (ParseError &e) {
      e.setOffset((size_t)a_raw_json);
      throw;
    }
  }

private:
  inline bool notWS(char c) const {
    return !(c == ' ' || c == '\n' || c == '\t' || c == '\r');
  }

  inline bool isDigit(char c) const { return (c >= '0' && c <= '9'); }

  uint8_t toHex(const char *C) {
    char c = *C;

    if (c >= '0' && c <= '9')
      return (uint8_t)(c - '0');
    else if (c >= 'A' && c <= 'F')
      return (uint8_t)(10 + c - 'A');
    else if (c >= 'a' && c <= 'f')
      return (uint8_t)(10 + c - 'a');
    else
      ERR_INVALID_CHAR(C);
  }

  enum ParseState : uint8_t {
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

  ValueType m_type;

  union ValueUnion {
    Object *o;
    Array *a;
    bool b;
    double n;
    String *s;
  } m_value;

  void toStringRecurse(std::string &a_buffer) const {
    switch (m_type) {
    case VT_OBJECT:
      a_buffer.append("{");
      for (ObjectIter i = m_value.o->begin(); i != m_value.o->end(); ++i) {
        if (i != m_value.o->begin())
          a_buffer.append(",\"");
        else
          a_buffer.append("\"");
        a_buffer.append(i->first);
        a_buffer.append("\":");

        i->second.toStringRecurse(a_buffer);
      }
      a_buffer.append("}");
      break;
    case VT_ARRAY:
      a_buffer.append("[");
      for (ArrayIter i = m_value.a->begin(); i != m_value.a->end(); ++i) {
        if (i != m_value.a->begin())
          a_buffer.append(",");
        i->toStringRecurse(a_buffer);
      }
      a_buffer.append("]");
      break;
    case VT_STRING:
      strToString(a_buffer, *m_value.s);
      break;
    case VT_NUMBER:
      numToString(a_buffer, m_value.n);
      break;
    case VT_BOOL:
      if (m_value.b)
        a_buffer.append("true");
      else
        a_buffer.append("false");
      break;
    case VT_NULL:
      a_buffer.append("null");
      break;
    }
  }

  inline void strToString(std::string &a_buffer,
                          const std::string &a_value) const {
    std::string::const_iterator c = a_value.begin();
    std::string::const_iterator a = c;

    a_buffer.append("\"");

    for (c = a_value.begin(); c != a_value.end(); ++c) {
      if (*c < 0x20) {
        a_buffer.append(a, c);
        a = c + 1;

        switch (*c) {
        case '\b':
          a_buffer.append("\\b");
          break;
        case '\f':
          a_buffer.append("\\f");
          break;
        case '\n':
          a_buffer.append("\\n");
          break;
        case '\r':
          a_buffer.append("\\r");
          break;
        case '\t':
          a_buffer.append("\\t");
          break;
        }
      } else if (*c == '\"') {
        a_buffer.append(a, c);
        a_buffer.append("\\\"");
        a = c + 1;
      } else if (*c == '\\') {
        a_buffer.append(a, c);
        a_buffer.append("\\\\");
        a = c + 1;
      }
    }

    a_buffer.append(a, c);
    a_buffer.append("\"");
  }

  inline void numToString(std::string &a_buffer, double a_value) const {
    size_t sz1 = a_buffer.size();
    a_buffer.resize(sz1 + 50);
    int sz2 = fpconv_dtoa(a_value, (char *)a_buffer.c_str() + sz1);
    a_buffer.resize(sz1 + sz2);
  }

  const char *parseObject(Value &a_parent, const char *start) {
    // On function entry, c is next char after '{'

    uint8_t state = PS_SEEK_KEY;
    const char *c = start;
    std::string key;

    a_parent.m_type = VT_OBJECT;
    a_parent.m_value.o = new Object();

    while (*c) {
      switch (state) {
      case PS_SEEK_KEY:
        if (*c == '}')
          return c;
        else if (*c == '"') {
          c = parseString(key, c + 1);

          if (!key.size())
            ERR_INVALID_KEY(c);

          state = PS_SEEK_SEP;
        } else if (notWS(*c))
          ERR_INVALID_CHAR(c);
        break;
      case PS_SEEK_SEP:
        if (*c == ':')
          state = PS_SEEK_VAL;
        else if (notWS(*c))
          ERR_INVALID_CHAR(c);
        break;
      case PS_SEEK_VAL:
        if (notWS(*c)) {
          c = parseValue((*a_parent.m_value.o)[key], c);
          state = PS_SEEK_OBJ_END;
        }
        break;

      case PS_SEEK_OBJ_END:
        if (*c == ',')
          state = PS_SEEK_KEY;
        else if (*c == '}')
          return c;
        else if (notWS(*c))
          ERR_INVALID_CHAR(c);
        break;
      }

      c++;
    }

    ERR_UNTERMINATED_OBJECT(start);
  }

  const char *parseArray(Value &a_parent, const char *start) {
    // On function entry, c is next char after '['
    const char *c = start;
    uint8_t state = PS_SEEK_VAL;
    Value value;

    a_parent.m_type = VT_ARRAY;
    a_parent.m_value.a = new Array();
    a_parent.m_value.a->reserve(20);

    while (*c) {
      switch (state) {
      case PS_SEEK_VAL:
        if (*c == ']')
          return c;
        else if (notWS(*c)) {
          c = parseValue(value, c);
          a_parent.m_value.a->push_back(std::move(value));
          state = PS_SEEK_SEP;
        }
        break;
      case PS_SEEK_SEP:
        if (*c == ',')
          state = PS_SEEK_VAL;
        else if (*c == ']')
          return c;
        else if (notWS(*c))
          ERR_INVALID_CHAR(c);
        break;
      }

      c++;
    }

    ERR_UNTERMINATED_ARRAY(start);
  }

  inline const char *parseValue(Value &a_value, const char *start) {
    const char *c = start;

    while (*c) {
      switch (*c) {
      case '{':
        c = parseObject(a_value, c + 1);
        return c;
      case '[':
        c = parseArray(a_value, c + 1);
        return c;
      case '"':
        a_value.m_type = VT_STRING;
        a_value.m_value.s = new String();
        c = parseString(*a_value.m_value.s, c + 1);
        return c;
      case 't':
        if (*(c + 1) == 'r' && *(c + 2) == 'u' && *(c + 3) == 'e') {
          a_value.m_type = VT_BOOL;
          a_value.m_value.b = true;
          c += 3;
          return c;
        } else
          ERR_INVALID_VALUE(c);
        break;
      case 'f':
        if (*(c + 1) == 'a' && *(c + 2) == 'l' && *(c + 3) == 's' &&
            *(c + 4) == 'e') {
          a_value.m_type = VT_BOOL;
          a_value.m_value.b = false;
          c += 4;
          return c;
        } else
          ERR_INVALID_VALUE(c);
        break;
      case 'n':
        if (*(c + 1) == 'u' && *(c + 2) == 'l' && *(c + 3) == 'l') {
          a_value.m_type = VT_NULL;
          c += 3;
          return c;
        } else
          ERR_INVALID_VALUE(c);
        break;
      default:
        if (*c == '-' || isDigit(*c) || *c == '.') {
          a_value.m_type = VT_NUMBER;
          c = parseNumber(a_value.m_value.n, c);
          return c;
        } else if (notWS(*c))
          ERR_INVALID_CHAR(c);
        break;
      }

      c++;
    }

    ERR_UNTERMINATED_VALUE(start);
  }

  inline const char *parseString(std::string &a_value, const char *start) {
    // On entry, c is next char after "
    const char *c = start;
    const char *a = start;
    uint32_t utf8;

    a_value.clear();

    while (*c) {
      if (*c == '\\') {
        if (c != a)
          a_value.append(a, (unsigned int)(c - a));

        switch (*(c + 1)) {
        case 'b':
          a_value.append("\b");
          break;
        case 'f':
          a_value.append("\f");
          break;
        case 'n':
          a_value.append("\n");
          break;
        case 'r':
          a_value.append("\r");
          break;
        case 't':
          a_value.append("\t");
          break;
        case '/':
          a_value.append("/");
          break;
        case '"':
          a_value.append("\"");
          break;
        case '\\':
          a_value.append("\\");
          break;
        case 'u':
          utf8 = (uint32_t)((toHex(c + 2) << 12) | (toHex(c + 3) << 8) |
                            (toHex(c + 4) << 4) | toHex(c + 5));

          if (utf8 < 0x80)
            a_value.append(1, (char)utf8);
          else if (utf8 < 0x800) {
            a_value.append(1, (char)(0xC0 | (utf8 >> 6)));
            a_value.append(1, (char)(0x80 | (utf8 & 0x3F)));
          } else if (utf8 < 0x10000) {
            a_value.append(1, (char)(0xE0 | (utf8 >> 12)));
            a_value.append(1, (char)(0x80 | ((utf8 >> 6) & 0x3F)));
            a_value.append(1, (char)(0x80 | (utf8 & 0x3F)));
          } else if (utf8 < 0x110000) {
            a_value.append(1, (char)(0xF0 | (utf8 >> 18)));
            a_value.append(1, (char)(0x80 | ((utf8 >> 12) & 0x3F)));
            a_value.append(1, (char)(0x80 | ((utf8 >> 6) & 0x3F)));
            a_value.append(1, (char)(0x80 | (utf8 & 0x3F)));
          } else
            ERR_INVALID_UNICODE(c);

          c += 4;
          break;
        default:
          ERR_INVALID_CHAR(c);
        }

        c++;
        a = c + 1;
      } else if (*c == '"') {
        if (c != a)
          a_value.append(a, (unsigned int)(c - a));
        return c;
      } else if (*c >= 0 && *c < 0x20) {
        ERR_INVALID_CHAR(c);
      }

      c++;
    }

    ERR_UNTERMINATED_VALUE(start);
  }

  inline const char *parseNumber(double &a_value, const char *start) {
    char *end;
    a_value = strtod(start, &end);

    return end - 1;
  }
};
} // namespace libjson

#endif
