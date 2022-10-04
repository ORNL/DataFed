
namespace DataFed {

  // These are standard actions that are not specific to a protocol
  enum class Action {
    CREATE,
    DELETE,
    UPDATE,
    SEARCH,
    GET
  };


  class API {

    type();

    response request(Protocol, Action, package );

    std::vector<Action> supportedActions();

  };
}
