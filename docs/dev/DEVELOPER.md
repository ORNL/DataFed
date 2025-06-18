# DataFed Developer Guide

This guide provides essential information for developers contributing to the DataFed project.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Environment Setup](#development-environment-setup)
- [Building DataFed](#building-datafed)
- [Contributing Guidelines](#contributing-guidelines)
- [Branch Naming Convention](#branch-naming-convention)
- [Pull Request Guidelines](#pull-request-guidelines)
- [Testing](#testing)
- [Code Style](#code-style)

## Getting Started

DataFed is a scientific data federation system with multiple components:

- **Core Server**: Central data management and metadata services
- **Web Server**: Web interface and API
- **Repository Server**: Data storage management
- **Python Client**: Command-line and programmatic interface
- **ArangoDB (Foxx)**: Database services

## Development Environment Setup

### Prerequisites

- Docker (recommended for containerized development)
- CMake 3.16+
- C++17 compatible compiler
- Node.js (for web development)
- Python 3.7+ (for client development)

### Local Development

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd DataFed
   ```

2. **Set up environment:**
   ```bash
   export PROJECT_ROOT=$(pwd)
   ```

## Building DataFed

### Docker Build (Recommended)

DataFed uses a multi-stage Docker build process. Images must be built in the correct order:

1. **Build dependencies image:**
   ```bash
   cd ${PROJECT_ROOT}
   docker build -f docker/Dockerfile.dependencies -t datafed-dependencies:latest .
   ```

2. **Build runtime image:**
   ```bash
   docker build -f docker/Dockerfile.runtime -t datafed-runtime .
   ```

3. **Build specific components:**

   **Web Server:**
   ```bash
   # Build intermediate image
   docker build -f web/docker/Dockerfile \
       --build-arg DEPENDENCIES="datafed-dependencies:latest" \
       --build-arg RUNTIME="datafed-runtime" \
       --target ws-build \
       -t datafed-web-build:latest \
       .

   # Build final web image
   docker build -f web/docker/Dockerfile \
       --build-arg DEPENDENCIES="datafed-dependencies:latest" \
       --build-arg RUNTIME="datafed-runtime" \
       -t datafed-web:latest \
       .
   ```

   **All Components (using build script):**
   ```bash
   ./scripts/compose_build_images.sh
   ```

### Local Build

For local development without Docker:

1. **C++ build:**
   ```bash
   cmake . && make
   ```

2. **Run tests:**
   ```bash
   ctest --output-on-failure
   ```

3. **Run single C++ test:**
   ```bash
   ctest -R unit_test_NAME
   ```

4. **JavaScript linting:**
   ```bash
   npx eslint web/**/*.js core/**/*.js
   ```

5. **Python formatting:**
   ```bash
   black python/ --line-length=100
   ```

## Contributing Guidelines

### Issue Tracking

- All work should be associated with a GitLab, Github, or Jira issue
- Create issues for bugs, features, or improvements
- Use descriptive titles and detailed descriptions

### Branch Naming Convention

Use one of the following formats:

**Option 1: Issue-first (recommended for GitLab auto-linking):**

```
<category>-<TEAM-issue-number>-<short-description>
```

Examples:

- `feat-DAPS-123-add-provenance-graph-icons`
- `fix-DAPS-456-memory-leak-core-server`
- `docs-DAPS-789-update-developer-guide`

**Categories:**

- `feat` - New features
- `fix` - Bug fixes
- `docs` - Documentation changes
- `test` - Test additions/modifications
- `refactor` - Code refactoring
- `perf` - Performance improvements
- `ci` - CI/CD changes
- `chore` - Maintenance tasks

## Pull Request Guidelines

### PR Title Format

```
[<TEAM-issue-number>] <Brief useful description>
```

Examples:

- `[DAPS-123] Add icon rendering for provenance graph labels`
- `[DAPS-456] Fix memory leak in core server connection pool`

If no ticket or issue exists, simply use one of the following

- `[NO-TICKET]` Update xyz
- `[TASK]` Update .env file

### PR Description Template

Your PR description should include:

**Required Sections:**

```markdown
## Ticket

- Put ticket # if JIRA or name if Gitlab and link

## Description

Brief explanation of what this PR does and why it's needed.

- Overview of code changes made
- Key files modified
- Architecture/design decisions

## How Has This Been Tested?

- Describe testing methodology
- List test cases added/modified
- Manual testing performed
- Testing environment details

## Screenshots/Artifacts (if applicable)

- Before/after screenshots for UI changes
- Videos demonstrating functionality
- Performance benchmarks
```

**Optional Sections:**

- **Technical Design Doc**: Link to design documents (if applicable)
- **Breaking Changes**: Note any breaking changes
- **Migration Guide**: Instructions for updating existing deployments
- **Related Issues**: Links to related issues/PRs

### Code Review Process

1. Ensure all CI checks pass
2. Request review from relevant team members
3. Address review feedback promptly
4. Squash commits before merging (if required)

## Testing

### C++ Testing

```bash
# Run all tests
ctest --output-on-failure

# Run specific test
ctest -R unit_test_Buffer

# Run with verbose output
ctest -V
```

### JavaScript Testing

```bash
# Web component tests
cd web/test
npm test

# Specific test file
npm test -- --grep "provenance"
```

### Foxx Database Testing

```bash
# Run Foxx tests (requires password)
./core/database/tests/test_foxx.sh -p PASSWORD [-t TEST_NAME]
```

## Code Style

### C++

- Use C++17 standard
- Enable Wall/Wextra warnings
- Use CamelCase for classes/interfaces (IInterface, Class)
- Use snake_case for variables/methods
- Always handle errors explicitly
- Prefer structured exception handling with TraceException

### JavaScript

- Follow JSDoc conventions for function documentation
- Document parameters and return values
- Use consistent indentation (spaces)
- Use meaningful variable names

### Python

- Use Black formatter with 100 character line length
- Follow PEP 8 guidelines
- Use type hints where appropriate

### General Guidelines

- Write clear, self-documenting code
- Add comments for complex logic
- Use descriptive commit messages
- Keep functions/methods focused and small
- Avoid hardcoded values (use constants/configuration)

## Security Guidelines

- Never commit secrets, keys, or passwords
- Use environment variables for sensitive configuration
- Follow secure coding practices
- Validate all user inputs
- Use HTTPS for all external communications

## Getting Help

- **Documentation**: Check existing documentation and README files
- **Issues**: Search existing issues before creating new ones
- **Discussions**: Use GitLab discussions for questions
- **Code Review**: Ask for clarification during code review

---

**Happy Coding!** 🚀

For questions or suggestions about this developer guide, please create an issue with the `docs` label.