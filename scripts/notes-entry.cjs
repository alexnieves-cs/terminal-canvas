module.exports = {
  blocks: require('../src/shared/md-blocks'),
  html: require('../src/shared/html-to-md'),
  imported: require('../src/shared/imported-note'),
  docx: require('../src/main/docx-import'),
  ...require('../src/main/asset-store'),
  ...require('../src/main/file-create'),
  ...require('../src/shared/portable'),
  layout: require('../src/shared/layout-schema'),
  adapt: require('../src/renderer/panels/layout-adapt'),
  panels: require('../src/renderer/panels/panels')
}
