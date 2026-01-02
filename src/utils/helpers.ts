export const safeStringify = (obj: any): string => {
  try {
    return JSON.stringify(obj);
  } catch {
    return '[Complex object - cannot stringify]';
  }
};

export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

export const getErrorDetails = (error: unknown): { message: string; stack?: string } => {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
    };
  }
  return {
    message: String(error),
  };
};
