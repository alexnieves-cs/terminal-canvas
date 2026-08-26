/* electron-builder's entry point into the config. Three lines on purpose: all
   of the decisions, and all of the comments explaining them, live in
   build/builder-config.cjs, which verify:package requires directly. */
'use strict'
const { buildConfig } = require('./build/builder-config.cjs')
module.exports = buildConfig()
