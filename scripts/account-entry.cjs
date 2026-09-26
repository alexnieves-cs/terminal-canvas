/* esbuild entry for verify:account. Every module here is electron-free by
   construction — the browser, the dialog and fetch are injected. */
module.exports = {
  ...require('../src/shared/credential-schema'),
  ...require('../src/shared/account'),
  ...require('../src/main/credential-store'),
  ...require('../src/main/account-auth'),
  ...require('../src/main/account-session'),
  ...require('../src/main/control-protocol'),
  ...require('../src/main/control-handler'),
  ...require('../src/cli/tc')
}
