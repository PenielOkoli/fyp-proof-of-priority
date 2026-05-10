export function getFriendlyError(error, fallbackMessage = "Something went wrong. Please try again.") {
  if (!error) return fallbackMessage;
  if (typeof error === "string") return error;
  if (error?.code === 4001) return "Transaction rejected.";

  const message =
    error?.reason ||
    error?.message ||
    error?.error?.message ||
    error?.data?.message ||
    error?.response?.data?.message ||
    error?.response?.statusText;

  if (message) {
    const cleaned = String(message)
      .replace(/^(Error:\s*)/i, "")
      .replace(/^(execution reverted:\s*)/i, "")
      .replace(/^(VM Exception while processing transaction: revert\s*)/i, "")
      .split("\n")[0]
      .trim();
    if (cleaned) return cleaned;
  }

  return fallbackMessage;
}
