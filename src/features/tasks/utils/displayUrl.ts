export function displayUrl(sourceUri: string): string {
  const withoutQueryText = sourceUri.split("?")[0] ?? sourceUri;

  try {
    const parsed = new URL(sourceUri);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    return parsed.toString();
  } catch {
    return withoutQueryText;
  }
}
