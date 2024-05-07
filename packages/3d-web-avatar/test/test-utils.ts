export function extractNumberFromErrorMessage(errorMessage: string): number | null {
  // Regular expression to match 'ignoring ' followed by one or more digits
  const regex = /ignoring (\d+)/;
  const match = errorMessage.match(regex);

  // Check if a match was found
  if (match && match[1]) {
    return parseInt(match[1], 10); // Convert the matched number string to an integer
  }

  // Return null or handle error differently if no match is found
  return null;
}
