#define BOOST_TEST_MAIN
#define BOOST_TEST_MODULE SchemaServiceFactory
#include <boost/test/unit_test.hpp>

// Local includes
#include "SchemaServiceFactory.hpp"
#include "ISchemaValidator.hpp"

// Public includes
#include "common/TraceException.hpp"

// Standard includes
#include <memory>
#include <string>

using namespace SDMS::Core;
using SDMS::LogContext;

// ============================================================================
// Mock Validator for Testing
// ============================================================================

namespace {

/**
 * @brief Minimal mock validator that tracks its identity.
 */
class MockValidator : public ISchemaValidator {
public:
  explicit MockValidator(const std::string &name) : m_name(name) {}

  ValidationResult validateDefinition(const std::string & /*format*/,
                                      const std::string & /*content*/,
                                      LogContext /*ctx*/) override {
    return ValidationResult::Ok();
  }

  ValidationResult validateMetadata(const std::string & /*schema_id*/,
                                    const std::string & /*format*/,
                                    const std::string & /*content*/,
                                    LogContext /*ctx*/) override {
    return ValidationResult::Ok();
  }

  bool hasValidationCapability() const override { return true; }

  const std::string &getName() const { return m_name; }

private:
  std::string m_name;
};



// ============================================================================
// Add MockStorage alongside MockValidator
// ============================================================================

/**
 * @brief Minimal mock storage that tracks its identity.
 */
class MockStorage : public ISchemaStorage {
public:
  explicit MockStorage(const std::string &name) : m_name(name) {}

  std::string storeContent(const std::string & /*id*/,
                           const std::string &a_content,
                           const std::string & /*desc*/,
                           LogContext /*ctx*/) override {
    return a_content;
  }

  StorageRetrieveResult retrieveContent(const std::string & /*id*/,
                                        const std::string &a_arango_def,
                                        LogContext /*ctx*/) override {
    return StorageRetrieveResult::Ok(a_arango_def);
  }

  std::string updateContent(const std::string & /*id*/,
                            const std::string &a_content,
                            const std::optional<std::string> & /*desc*/,
                            LogContext /*ctx*/) override {
    return a_content;
  }

  void deleteContent(const std::string & /*id*/,
                     LogContext /*ctx*/) override {}

  const std::string &getName() const { return m_name; }

private:
  std::string m_name;
};

}
// ============================================================================
// Helper to register both storage + validator for an engine
// ============================================================================

void registerEngine(SchemaServiceFactory &factory,
                    const std::string &engine,
                    const std::string &validator_name,
                    const std::string &storage_name) {
  factory.registerValidator(engine, std::make_shared<MockValidator>(validator_name));
  factory.registerStorage(engine, std::make_shared<MockStorage>(storage_name));
}

// ============================================================================
// Test Suite: setDefaultSchemaType
// ============================================================================

BOOST_AUTO_TEST_SUITE(SetDefaultSchemaType)

BOOST_AUTO_TEST_CASE(throws_if_validator_not_registered) {
  SchemaServiceFactory factory;
  factory.registerStorage("Engine", std::make_shared<MockStorage>("S"));

  BOOST_CHECK_THROW(factory.setDefaultSchemaType("Engine"), TraceException);
}

BOOST_AUTO_TEST_CASE(throws_if_storage_not_registered) {
  SchemaServiceFactory factory;
  factory.registerValidator("Engine", std::make_shared<MockValidator>("V"));

  BOOST_CHECK_THROW(factory.setDefaultSchemaType("Engine"), TraceException);
}

BOOST_AUTO_TEST_CASE(throws_if_neither_registered) {
  SchemaServiceFactory factory;

  BOOST_CHECK_THROW(factory.setDefaultSchemaType("Engine"), TraceException);
}

BOOST_AUTO_TEST_CASE(succeeds_when_both_registered) {
  SchemaServiceFactory factory;
  registerEngine(factory, "Engine", "V", "S");

  BOOST_CHECK_NO_THROW(factory.setDefaultSchemaType("Engine"));
}

BOOST_AUTO_TEST_SUITE_END()

// ============================================================================
// Test Suite: Default Validator (updated for setDefaultSchemaType)
// ============================================================================

BOOST_AUTO_TEST_SUITE(DefaultValidator)

BOOST_AUTO_TEST_CASE(set_and_get_default_for_empty_engine) {
  SchemaServiceFactory factory;
  registerEngine(factory, "json-schema", "Default", "DefaultStorage");
  factory.setDefaultSchemaType("json-schema");

  auto *retrieved = dynamic_cast<MockValidator *>(&factory.getValidator(""));
  BOOST_REQUIRE(retrieved != nullptr);
  BOOST_TEST(retrieved->getName() == "Default");
}

BOOST_AUTO_TEST_CASE(unregistered_engine_returns_default) {
  SchemaServiceFactory factory;
  registerEngine(factory, "json-schema", "Default", "DefaultStorage");
  registerEngine(factory, "SpecificEngine", "Specific", "SpecificStorage");
  factory.setDefaultSchemaType("json-schema");

  // Registered engine returns specific validator
  auto *v_specific = dynamic_cast<MockValidator *>(
      &factory.getValidator("SpecificEngine"));
  BOOST_TEST(v_specific->getName() == "Specific");

  // Unregistered engine returns default
  auto *v_unknown = dynamic_cast<MockValidator *>(
      &factory.getValidator("UnknownEngine"));
  BOOST_TEST(v_unknown->getName() == "Default");
}

BOOST_AUTO_TEST_CASE(native_engine_returns_default) {
  SchemaServiceFactory factory;
  registerEngine(factory, "json-schema", "Default", "DefaultStorage");
  factory.setDefaultSchemaType("json-schema");

  auto *retrieved = dynamic_cast<MockValidator *>(
      &factory.getValidator("native"));
  BOOST_REQUIRE(retrieved != nullptr);
  BOOST_TEST(retrieved->getName() == "Default");
}

BOOST_AUTO_TEST_CASE(default_can_be_replaced) {
  SchemaServiceFactory factory;
  registerEngine(factory, "engine-a", "Default1", "Storage1");
  registerEngine(factory, "engine-b", "Default2", "Storage2");

  factory.setDefaultSchemaType("engine-a");
  BOOST_TEST(dynamic_cast<MockValidator *>(
      &factory.getValidator(""))->getName() == "Default1");

  factory.setDefaultSchemaType("engine-b");
  BOOST_TEST(dynamic_cast<MockValidator *>(
      &factory.getValidator(""))->getName() == "Default2");
}

BOOST_AUTO_TEST_CASE(no_default_throws_for_unknown_engine) {
  SchemaServiceFactory factory;
  registerEngine(factory, "SpecificEngine", "Specific", "SpecificStorage");
  // No default set

  BOOST_CHECK_THROW(factory.getValidator("UnknownEngine"), TraceException);
}

BOOST_AUTO_TEST_CASE(no_default_throws_for_empty_engine) {
  SchemaServiceFactory factory;

  BOOST_CHECK_THROW(factory.getValidator(""), TraceException);
}

BOOST_AUTO_TEST_SUITE_END()

// ============================================================================
// Test Suite: hasCustomValidator (one test updated)
// ============================================================================

BOOST_AUTO_TEST_SUITE(HasCustomValidator)

BOOST_AUTO_TEST_CASE(returns_false_for_unregistered) {
  SchemaServiceFactory factory;

  BOOST_TEST(factory.hasCustomValidator("UnknownEngine") == false);
}

BOOST_AUTO_TEST_CASE(returns_true_for_registered) {
  SchemaServiceFactory factory;
  auto mock = std::make_shared<MockValidator>("Test");

  factory.registerValidator("TestEngine", mock);

  BOOST_TEST(factory.hasCustomValidator("TestEngine") == true);
}

BOOST_AUTO_TEST_CASE(default_does_not_count_as_custom) {
  SchemaServiceFactory factory;
  registerEngine(factory, "json-schema", "Default", "DefaultStorage");
  factory.setDefaultSchemaType("json-schema");

  // Default is set, but no custom validator for these engines
  BOOST_TEST(factory.hasCustomValidator("SomeEngine") == false);
  BOOST_TEST(factory.hasCustomValidator("") == false);

  // The default engine itself IS registered, so it shows as custom
  BOOST_TEST(factory.hasCustomValidator("json-schema") == true);
}

BOOST_AUTO_TEST_CASE(case_sensitive_check) {
  SchemaServiceFactory factory;
  auto mock = std::make_shared<MockValidator>("Test");

  factory.registerValidator("TestEngine", mock);

  BOOST_TEST(factory.hasCustomValidator("TestEngine") == true);
  BOOST_TEST(factory.hasCustomValidator("testengine") == false);
  BOOST_TEST(factory.hasCustomValidator("TESTENGINE") == false);
}

BOOST_AUTO_TEST_SUITE_END()

