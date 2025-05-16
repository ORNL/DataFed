# DataFed React+TypeScript Frontend

This directory contains the React+TypeScript implementation of the DataFed web UI.

## Project Structure

```
web/react-design/
├── jest.config.js          # Jest configuration
├── tsconfig.json           # TypeScript configuration
└── src/
    ├── components/         # React components
    │   └── DataRecord/     # Data record components
    │       └── DataRecordView.tsx
    ├── contexts/           # React contexts
    │   └── UserContext.tsx
    ├── services/           # API services
    │   └── api.ts
    ├── types/              # TypeScript type definitions
    │   └── models.ts
    ├── App.css             # App styles
    ├── App.tsx             # Main App component
    ├── App.test.tsx        # Tests for App component
    ├── index.css           # Global styles
    ├── main.tsx            # Entry point
    ├── index.html          # HTML template
```

## Development Workflow

### Prerequisites

- Node.js 22.14.0 or higher
- npm 8.x or higher

### Installation

```bash
# From the web directory
npm install
```

### Development

```bash
# Start the development server
npm run dev
```

This will start the development server at http://localhost:3000.

### Building

```bash
# Build for production
npm run build
```

The build output will be in the `dist/react` directory.

### Testing

```bash
# Run tests
npm run test:react

# Run tests in watch mode
npm run test:react:watch
```

### Linting and Formatting

```bash
# Lint the code
npm run lint:react

# Format the code
npm run format
```

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Define interfaces for all data models in `src/types`
- Use explicit typing for function parameters and return values

### React

- Use functional components with hooks
- Use React context for global state management
- Follow the container/presentational component pattern

### Testing

- Write tests for all components and services
- Use React Testing Library for component tests
- Aim for high test coverage

### Styling

- Use CSS modules for component-specific styles
- Use a consistent naming convention for CSS classes


## Project Dependencies

- **React**: UI library
- **TypeScript**: Static type checking
- **Jest**: Testing framework
- **React Testing Library**: Testing utilities for React
- **ESLint**: Code linting
- **Prettier**: Code formatting

## API Integration

The frontend communicates with the DataFed API through the `services/api.ts` module. All API calls should be made through this service to ensure consistent error handling and response formatting.

## Deployment

The React application is built and served by the DataFed web service. The build output is placed in the `dist/react` directory, which is then served by the Express server.