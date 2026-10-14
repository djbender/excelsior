/** Kept as a constant so the CSP can allow it by hash. */
export const LOGIN_STYLE = `
      body { font-family: system-ui, sans-serif; max-width: 20rem; margin: 4rem auto; padding: 0 1rem; }
      input, button { font: inherit; padding: 0.5rem; width: 100%; box-sizing: border-box; margin-top: 0.5rem; }
      .error { color: #b00020; }
    `;

export function loginPage(error?: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Sign in</title>
    <style>${LOGIN_STYLE}</style>
  </head>
  <body>
    <h1>Sign in</h1>
    <form method="post" action="/login">
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" autofocus required />
      ${error ? `<p class="error" role="alert">${error}</p>` : ''}
      <button type="submit">Sign in</button>
    </form>
  </body>
</html>
`;
}
