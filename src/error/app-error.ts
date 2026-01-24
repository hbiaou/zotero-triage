export class AppError extends Error {
  constructor(
    public code: string,
    public userMessage: string,
    public technicalDetails?: string,
    public retryable: boolean = false
  ) {
    super(userMessage);
    this.name = 'AppError';
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, technicalDetails?: string, retryable: boolean = true) {
    super('DB_ERROR', message, technicalDetails, retryable);
    this.name = 'DatabaseError';
  }
}

export class ConnectionError extends AppError {
  constructor(message: string, technicalDetails?: string) {
    super('CONN_ERROR', message, technicalDetails, true);
    this.name = 'ConnectionError';
  }
}

export class SchemaError extends AppError {
  constructor(message: string, technicalDetails?: string) {
    super('SCHEMA_ERROR', message, technicalDetails, false);
    this.name = 'SchemaError';
  }
}
