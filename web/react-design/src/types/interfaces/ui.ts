/**
 * Dialog options interface
 */
interface DialogOptions {
  title: string;
  message?: string;
  buttons?: DialogButton[];
  width?: number | string;
  height?: number | string;
  modal?: boolean;
  resizable?: boolean;
  draggable?: boolean;
  closeOnEscape?: boolean;
  position?: {
    my?: string;
    at?: string;
    of?: string | Element;
    collision?: string;
  };
  classes?: {
    [key: string]: string;
  };
}

/**
 * Dialog button interface
 */
interface DialogButton {
  text: string;
  icon?: string;
  click: () => void;
  class?: string;
}

/**
 * Toast notification interface
 */
interface ToastNotification {
  id: string;
  type: "success" | "error" | "warning" | "info";
  message: string;
  title?: string;
  duration?: number;
  dismissible?: boolean;
}

/**
 * UI theme interface
 */
interface UITheme {
  id: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  textColor: string;
  linkColor: string;
  errorColor: string;
  warningColor: string;
  successColor: string;
  infoColor: string;
  fontFamily?: string;
  borderRadius?: string;
  isDark?: boolean;
}

/**
 * UI layout interface
 */
interface UILayout {
  id: string;
  name: string;
  sidebar?: {
    visible: boolean;
    width: number | string;
    position: "left" | "right";
  };
  header?: {
    visible: boolean;
    height: number | string;
  };
  footer?: {
    visible: boolean;
    height: number | string;
  };
}

/**
 * UI state interface
 */
interface UIState {
  theme: string;
  layout: string;
  sidebarCollapsed: boolean;
  activeDialog?: string;
  activeTab?: string;
  notifications: ToastNotification[];
  loading: boolean;
  error?: string;
}

export {
  DialogOptions,
  DialogButton,
  ToastNotification,
  UITheme,
  UILayout,
  UIState,
};
