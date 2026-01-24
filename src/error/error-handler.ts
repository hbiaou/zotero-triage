import { AppError } from './app-error';

export interface ErrorAction {
  label: string;
  action: () => void | Promise<void>;
}

export interface ErrorContext {
  title: string;
  message: string;
  actions: ErrorAction[];
  technicalDetails?: string;
}

export function getErrorContext(error: unknown): ErrorContext {
  // Handle AppError subclasses
  if (error instanceof AppError) {
    return mapAppError(error);
  }

  // Handle raw Error
  if (error instanceof Error) {
    return mapRawError(error);
  }

  // Handle unknown error types
  return {
    title: 'Unknown Error',
    message: 'An unexpected error occurred.',
    actions: [
      {
        label: 'Copy Details',
        action: () => navigator.clipboard.writeText(String(error))
      }
    ],
    technicalDetails: String(error)
  };
}

function mapAppError(error: AppError): ErrorContext {
  // Map error codes to user contexts
  switch (error.code) {
    case 'DB_ERROR':
      return {
        title: 'Database Error',
        message: error.userMessage,
        actions: [
          { label: 'Retry', action: () => {} },
          { label: 'Copy Details', action: () => navigator.clipboard.writeText(error.technicalDetails || error.message) }
        ],
        technicalDetails: error.technicalDetails
      };

    case 'CONN_ERROR':
      return {
        title: 'Connection Failed',
        message: error.userMessage,
        actions: [
          { label: 'Open Settings', action: () => {} },
          { label: 'Retry', action: () => {} }
        ],
        technicalDetails: error.technicalDetails
      };

    case 'SCHEMA_ERROR':
      return {
        title: 'Incompatible Zotero Version',
        message: error.userMessage,
        actions: [
          { label: 'Check for Updates', action: () => {} }
        ],
        technicalDetails: error.technicalDetails
      };

    default:
      return {
        title: 'Error',
        message: error.userMessage,
        actions: [
          { label: 'Dismiss', action: () => {} }
        ],
        technicalDetails: error.technicalDetails
      };
  }
}

function mapRawError(error: Error): ErrorContext {
  // Check for specific error patterns in message
  if (error.message.includes('SQLITE_BUSY') || error.message.includes('database is locked')) {
    return {
      title: 'Database Temporarily Locked',
      message: 'Zotero is currently accessing the database. Close Zotero or wait a moment and try again.',
      actions: [
        { label: 'Retry', action: () => {} }
      ],
      technicalDetails: error.message
    };
  }

  if (error.message.includes('not found at')) {
    return {
      title: 'Database Not Found',
      message: 'The Zotero database could not be found at the configured path.',
      actions: [
        { label: 'Open Settings', action: () => {} }
      ],
      technicalDetails: error.message
    };
  }

  // Generic error
  return {
    title: 'Operation Failed',
    message: 'An unexpected error occurred. Check the technical details below.',
    actions: [
      { label: 'Copy Details', action: () => navigator.clipboard.writeText(error.stack || error.message) }
    ],
    technicalDetails: error.stack || error.message
  };
}
