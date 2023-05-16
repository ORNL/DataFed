#ifndef GSSAPI_UTILS_HPP
#define GSSAPI_UTILS_HPP

#include <gssapi.h>
#include <stdexcept>
#include <string.h>
#include <string>

namespace SDMS {

/**
 * @class gssString
 * @author Dale V. Stansberry
 * @date 17/01/18
 * @brief Wraps gss_buffer_desc for easier and more correct usage
 */
class gssString {
 public:
  gssString() {
    m_gss_buf.value = 0;
    m_gss_buf.length = 0;
  }

  gssString(const std::string& a_src) {
    m_gss_buf.value = 0;
    m_gss_buf.length = 0;

    set(a_src);
  }

  gssString(const char* a_src) {
    m_gss_buf.value = 0;
    m_gss_buf.length = 0;

    set(a_src);
  }

  gssString(gss_name_t a_src) {
    m_gss_buf.value = 0;
    m_gss_buf.length = 0;

    set_name(a_src);
  }

  ~gssString() {
    if (m_gss_buf.value) free(m_gss_buf.value);
  }

  gssString& operator=(const std::string& a_src) {
    set(a_src);
    return *this;
  }

  gssString& operator=(const char* a_src) {
    set(a_src);
    return *this;
  }

  gssString& operator=(gss_name_t a_src) {
    set_name(a_src);
    return *this;
  }

  std::string to_string() const {
    return std::string((char*)m_gss_buf.value, m_gss_buf.length);
  }

  char* to_cstr() const {
    char* str = new char[m_gss_buf.length + 1];

    if (m_gss_buf.length)
      memcpy(str, m_gss_buf.value, m_gss_buf.length + 1);
    else
      str[0] = 0;

    return str;
  }

  operator gss_buffer_t() { return &m_gss_buf; }

  operator const gss_buffer_desc*() const { return &m_gss_buf; }

  friend std::ostream& operator<<(std::ostream& os, const gssString& obj);

 private:
  void set(const std::string& a_src) {
    if (m_gss_buf.value) free(m_gss_buf.value);

    m_gss_buf.length = a_src.size();
    m_gss_buf.value = malloc(m_gss_buf.length + 1);

    if (!m_gss_buf.value) throw std::runtime_error("gssString malloc failed");

    memcpy(m_gss_buf.value, a_src.c_str(), m_gss_buf.length + 1);
  }

  void set(const char* a_src) {
    if (m_gss_buf.value) free(m_gss_buf.value);

    m_gss_buf.length = strlen(a_src);
    m_gss_buf.value = malloc(m_gss_buf.length + 1);

    if (!m_gss_buf.value) throw std::runtime_error("gssString malloc failed");

    memcpy(m_gss_buf.value, a_src, m_gss_buf.length + 1);
  }

  void set_name(gss_name_t a_src) {
    if (m_gss_buf.value) {
      free(m_gss_buf.value);
      m_gss_buf.value = 0;
      m_gss_buf.length = 0;
    }

    OM_uint32 min_stat;
    gss_OID name_type;

    if (gss_display_name(&min_stat, a_src, &m_gss_buf, &name_type) !=
        GSS_S_COMPLETE)
      throw std::runtime_error("gss_display_name failed");
  }

  gss_buffer_desc m_gss_buf;
};

std::ostream& operator<<(std::ostream& os, const gssString& obj) {
  os.write((char*)obj.m_gss_buf.value, obj.m_gss_buf.length);
  return os;
}

}  // namespace SDMS

#endif
