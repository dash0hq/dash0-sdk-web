// Ensure this is treated as a module.
export { };

declare global {
  interface Window {
    Zone?: any;
  }

  type ErrorLike = {
    message: string;
    stack?: string;

    // to permit ['foo'] based access that doesn't break
    // when pushed through the Closure compiler
    [key: string]: number | string | null | undefined;
  };
}
