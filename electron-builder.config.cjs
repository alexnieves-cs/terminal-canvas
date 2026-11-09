/* electron-builder's entry point into the config. Three lines on purpose: all
   of the decisions, and all of the comments explaining them, live in
   build/builder-config.cjs, which verify:package requires directly. The one
   thing read here is the environment, because builder-config is pure: M630's
   signing turns on for TC_MAC_SIGN=1 and nothing else (release.yml sets it
   only when the Apple secrets exist). */
'use strict'
const { buildConfig } = require('./build/builder-config.cjs')
module.exports = buildConfig({ sign: process.env.TC_MAC_SIGN === '1' })
