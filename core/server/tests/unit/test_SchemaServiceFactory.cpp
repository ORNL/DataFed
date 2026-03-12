#define BOOST_TEST_MAIN
#define BOOST_TEST_MODULE SchemaServiceFactory
#include <boost/test/unit_test.hpp>

// Local includes
#include "SchemaServiceFactory.hpp"
#include "ISchemaValidator.hpp"

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

} // anonymous namespace

// ============================================================================
// Test Suite: Validator Registration
// ============================================================================

BOOST_AUTO_TEST_SUITE(ValidatorRegistration)

BOOST_AUTO_TEST_CASE(register_and_retrieve_validator) {
  SchemaServiceFactory factory;
  auto mock = std::make_shared<MockValidator>("TestValidator");

  factory.registerValidator("TestEngine", mock);

  ISchemaValidator &retrieved = factory.getValidator("TestEngine");
  auto *mock_ptr = dynamic_cast<MockValidator *>(&retrieved);
  BOOST_REQUIRE(mock_ptr != nullptr);
  BOOST_TEST(mock_ptr->getName() == "TestValidator");
}

BOOST_AUTO_TEST_CASE(register_multiple_validators) {
  SchemaServiceFactory factory;
  auto mock1 = std::make_shared<MockValidator>("Validator1");
  auto mock2 = std::make_shared<MockValidator>("Validator2");

  factory.registerValidator("Engine1", mock1);
  factory.registerValidator("Engine2", mock2);

  auto *v1 = dynamic_cast<MockValidator *>(&factory.getValidator("Engine1"));
  auto *v2 = dynamic_cast<MockValidator *>(&factory.getValidator("Engine2"));

  BOOST_REQUIRE(v1 != nullptr);
  BOOST_REQUIRE(v2 != nullptr);
  BOOST_TEST(v1->getName() == "Validator1");
  BOOST_TEST(v2->getName() == "Validator2");
}

BOOST_AUTO_TEST_CASE(register_overwrites_existing) {
  SchemaServiceFactory factory;
  auto original = std::make_shared<MockValidator>("Original");
  auto replacement = std::make_shared<MockValidator>("Replacement");

  factory.registerValidator("Engine", original);
  factory.registerValidator("Engine", replacement);

  auto *retrieved = dynamic_cast<MockValidator *>(&factory.getValidator("Engine"));
  BOOST_REQUIRE(retrieved != nullptr);
  BOOST_TEST(retrieved->getName() == "Replacement");
}

BOOST_AUTO_TEST_CASE(engine_names_are_case_sensitive) {
  SchemaServiceFactory factory;
  auto lower = std::make_shared<MockValidator>("LowerCase");
  auto upper = std::make_shared<MockValidator>("UpperCase");

  factory.registerValidator("jsonschema", lower);
  factory.registerValidator("JSONSCHEMA", upper);

  auto *v_lower = dynamic_cast<MockValidator *>(&factory.getValidator("jsonschema"));
  auto *v_upper = dynamic_cast<MockValidator *>(&factory.getValidator("JSONSCHEMA"));

  BOOST_REQUIRE(v_lower != nullptr);
  BOOST_REQUIRE(v_upper != nullptr);
  BOOST_TEST(v_lower->getName() == "LowerCase");
  BOOST_TEST(v_upper->getName() == "UpperCase");
}

BOOST_AUTO_TEST_SUITE_END()

// ============================================================================
// Test Suite: Default Validator
// ============================================================================

BOOST_AUTO_TEST_SUITE(DefaultValidator)

BOOST_AUTO_TEST_CASE(set_and_get_default_for_empty_engine) {
  SchemaServiceFactory factory;
  auto default_val = std::make_shared<MockValidator>("Default");

  factory.setDefaultValidator(default_val);

  auto *retrieved = dynamic_cast<MockValidator *>(&factory.getValidator(""));
  BOOST_REQUIRE(retrieved != nullptr);
  BOOST_TEST(retrieved->getName() == "Default");
}

BOOST_AUTO_TEST_CASE(unregistered_engine_returns_default) {
  SchemaServiceFactory factory;
  auto default_val = std::make_shared<MockValidator>("Default");
  auto specific = std::make_shared<MockValidator>("Specific");

  factory.setDefaultValidator(default_val);
  factory.registerValidator("SpecificEngine", specific);

  // Registered engine returns specific validator
  auto *v_specific = dynamic_cast<MockValidator *>(&factory.getValidator("SpecificEngine"));
  BOOST_TEST(v_specific->getName() == "Specific");

  // Unregistered engine returns default
  auto *v_unknown = dynamic_cast<MockValidator *>(&factory.getValidator("UnknownEngine"));
  BOOST_TEST(v_unknown->getName() == "Default");
}

BOOST_AUTO_TEST_CASE(native_engine_returns_default) {
  SchemaServiceFactory factory;
  auto default_val = std::make_shared<MockValidator>("Default");

  factory.setDefaultValidator(default_val);

  auto *retrieved = dynamic_cast<MockValidator *>(&factory.getValidator("native"));
  BOOST_REQUIRE(retrieved != nullptr);
  BOOST_TEST(retrieved->getName() == "Default");
}

BOOST_AUTO_TEST_CASE(default_can_be_replaced) {
  SchemaServiceFactory factory;
  auto default1 = std::make_shared<MockValidator>("Default1");
  auto default2 = std::make_shared<MockValidator>("Default2");

  factory.setDefaultValidator(default1);
  BOOST_TEST(dynamic_cast<MockValidator *>(&factory.getValidator(""))->getName() == "Default1");

  factory.setDefaultValidator(default2);
  BOOST_TEST(dynamic_cast<MockValidator *>(&factory.getValidator(""))->getName() == "Default2");
}

BOOST_AUTO_TEST_CASE(no_default_throws_for_unknown_engine) {
  SchemaServiceFactory factory;
  auto specific = std::make_shared<MockValidator>("Specific");

  factory.registerValidator("SpecificEngine", specific);
  // No default set

  BOOST_CHECK_THROW(factory.getValidator("UnknownEngine"), std::runtime_error);
}

BOOST_AUTO_TEST_CASE(no_default_throws_for_empty_engine) {
  SchemaServiceFactory factory;

  BOOST_CHECK_THROW(factory.getValidator(""), std::runtime_error);
}

BOOST_AUTO_TEST_SUITE_END()

// ============================================================================
// Test Suite: hasCustomValidator
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
  auto default_val = std::make_shared<MockValidator>("Default");

  factory.setDefaultValidator(default_val);

  // Default is set, but no custom validator for this engine
  BOOST_TEST(factory.hasCustomValidator("SomeEngine") == false);
  BOOST_TEST(factory.hasCustomValidator("") == false);
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

// ============================================================================
// Test Suite: Validator Reference Stability
// ============================================================================

BOOST_AUTO_TEST_SUITE(ValidatorReferenceStability)

BOOST_AUTO_TEST_CASE(same_reference_returned_on_multiple_calls) {
  SchemaServiceFactory factory;
  auto mock = std::make_shared<MockValidator>("Test");

  factory.registerValidator("Engine", mock);

  ISchemaValidator &ref1 = factory.getValidator("Engine");
  ISchemaValidator &ref2 = factory.getValidator("Engine");

  BOOST_TEST(&ref1 == &ref2);
}

BOOST_AUTO_TEST_CASE(reference_remains_valid_after_other_registrations) {
  SchemaServiceFactory factory;
  auto mock1 = std::make_shared<MockValidator>("First");

  factory.registerValidator("Engine1", mock1);
  ISchemaValidator &ref1 = factory.getValidator("Engine1");

  // Register more validators
  auto mock2 = std::make_shared<MockValidator>("Second");
  auto mock3 = std::make_shared<MockValidator>("Third");
  factory.registerValidator("Engine2", mock2);
  factory.registerValidator("Engine3", mock3);

  // Original reference should still be valid
  auto *mock_ptr = dynamic_cast<MockValidator *>(&ref1);
  BOOST_REQUIRE(mock_ptr != nullptr);
  BOOST_TEST(mock_ptr->getName() == "First");
}

BOOST_AUTO_TEST_SUITE_END()
