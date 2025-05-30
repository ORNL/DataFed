import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import App from "./App";
import * as UserContext from "./contexts/UserContext";

// Mock the useUser hook
jest.mock("./contexts/UserContext", () => {
  const originalModule = jest.requireActual("./contexts/UserContext");
  return {
    ...originalModule,
    useUser: jest.fn(),
  };
});

describe("App Component", () => {
  const mockUseUser = UserContext.useUser as jest.Mock;

  beforeEach(() => {
    // Reset mock before each test
    mockUseUser.mockReset();
  });

  test("renders loading state", () => {
    mockUseUser.mockReturnValue({
      user: null,
      loading: true,
      error: null,
      login: jest.fn(),
      logout: jest.fn(),
      refreshUser: jest.fn(),
    });

    render(<App />);
    expect(screen.getByText(/loading user data/i)).toBeInTheDocument();
  });

  test("renders error state", () => {
    mockUseUser.mockReturnValue({
      user: null,
      loading: false,
      error: "Failed to load user",
      login: jest.fn(),
      logout: jest.fn(),
      refreshUser: jest.fn(),
    });

    render(<App />);
    expect(screen.getByText(/error: failed to load user/i)).toBeInTheDocument();
  });

  test("renders login required state when user is not authenticated", () => {
    mockUseUser.mockReturnValue({
      user: null,
      loading: false,
      error: null,
      login: jest.fn(),
      logout: jest.fn(),
      refreshUser: jest.fn(),
    });

    render(<App />);
    expect(
      screen.getByText(/please log in to access datafed/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /log in/i })).toBeInTheDocument();
  });

  test("renders main app when user is authenticated", () => {
    const mockUser = {
      uid: "user123",
      nameFirst: "John",
      nameLast: "Doe",
      email: "john.doe@example.com",
      org: "ORNL",
      isAdmin: false,
    };

    const mockLogout = jest.fn();

    mockUseUser.mockReturnValue({
      user: mockUser,
      loading: false,
      error: null,
      login: jest.fn(),
      logout: mockLogout,
      refreshUser: jest.fn(),
    });

    render(<App />);

    // Check if user info is displayed
    expect(screen.getByText(/welcome, john doe/i)).toBeInTheDocument();

    // Check if form elements are present
    expect(screen.getByLabelText(/record id/i)).toBeInTheDocument();
    expect(screen.getByText(/view record/i)).toBeInTheDocument();

    // Test logout button
    fireEvent.click(screen.getByText(/log out/i));
    expect(mockLogout).toHaveBeenCalled();
  });

  test("handles form submission", () => {
    const mockUser = {
      uid: "user123",
      nameFirst: "John",
      nameLast: "Doe",
      email: "john.doe@example.com",
      org: "ORNL",
      isAdmin: false,
    };

    mockUseUser.mockReturnValue({
      user: mockUser,
      loading: false,
      error: null,
      login: jest.fn(),
      logout: jest.fn(),
      refreshUser: jest.fn(),
    });

    // Mock DataRecordView component since we're not testing its implementation
    jest.mock("./components/DataRecord/DataRecordView", () => {
      return {
        __esModule: true,
        default: () => (
          <div data-testid="data-record-view">Record View Component</div>
        ),
      };
    });

    render(<App />);

    // Enter a record ID
    const input = screen.getByLabelText(/record id/i);
    fireEvent.change(input, { target: { value: "record123" } });

    // Submit the form
    fireEvent.click(screen.getByText(/view record/i));

    // Check if the record section title appears
    expect(screen.getByText(/record details/i)).toBeInTheDocument();
  });
});
