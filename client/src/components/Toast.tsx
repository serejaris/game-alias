interface ToastProps {
  message: string;
}

export function Toast({ message }: ToastProps) {
  return <div id="error-toast" className={`toast ${message ? '' : 'hidden'}`}>{message}</div>;
}
