import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * M181. THE STARTER'S TWO FILES, written ONCE under `userData/starter`: a
 * note the person is invited to type in, and a small picture for the image
 * example. Only a file that does not exist is written — a starter that
 * re-wrote its note on every launch would erase the one file it asked the
 * person to edit — and `wrote` says which files THIS call created, so the
 * caller can tell a first run from a repeat. The picture is a 240x150 PNG
 * authored once (flat bands, 612 bytes) and inlined here rather than shipped
 * as a resource: a resource path is a second thing the package must carry
 * and `verify:package` must pin. Plain node: `verify:file starter.prepare.1`.
 */

const WELCOME_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAPAAAACWCAIAAABvmpKCAAACK0lEQVR42u3cIRGAMBiA0SVBoiaWAUWGqSVYhsUjBBqFWAQqcLj/eHdfhKe/tOQtXOvewlX6CFc9znAloIEGGmiggQYaaKCBBhpooIEGGmiggQYaaKCBBhpooIEGGmiggQYaaKCBBhpooIEGGmiggQYaaKCBBhpooIEGGmiggQYaaKCBBhpooIEGGmiggQYaaKCBBhpooIEGGmiggQYaaKCBBhpooIEGGmiggQYaaKCBBhpooIEGGmiggQYaaKCBBhpooIEGGmiggQYaaKCBBhpooIEGGmiggQYaaKCBBhpooIEGGmiggQYaaKCBBhpooIEGGmiggQYaaKCBBhpooIEGGmiggQYaaKBfd91T+hzQAhpoAQ20gJaAFtBAC2igBTTQAloCWkADLaCBFtBAC2gJaAENtIAGWkADLaAloAU00AIaaAENtICWgBbQQAtooAU00AJaAlpA+0P7Q/tDAw000EADDTTQQAMNNNBAAw000EADDTTQQAMNNNBAAw000EADDTTQQAMNNNBAAw000EADDTTQQAMNNNBAAw000EADDTTQQAMNNNBAAw000EADDTTQQAMNNNBAAw000EADDTTQQAMNNNBAAw000EADDTTQQAMNNNBAAw000EADDTTQQAMNNNBAAw000EADDTTQQAMNNNBAAw000EADDTTQQAMNNNBAAw000EADDTTQQAMNNNBAAw000EADDTTQQAMNNNBAAw000EAD/XvQD2iC9hbjCmItAAAAAElFTkSuQmCC'

export const WELCOME_NOTE = [
  '# Welcome to your canvas',
  '',
  'This is a note: a Markdown file on the canvas, saved beside your work. Edit it in place.',
  '',
  'Around your agent sit one example of each kind of object:',
  '',
  '- a **terminal**, which starts a shell when you click it;',
  '- a **workflow**, a saved shape of work you can run;',
  '- an **image**, a picture beside the work.',
  '',
  'Close any example you do not need. Your agent is the panel in the middle: write to it in plain language.',
  ''
].join('\n')

import type { StarterFiles } from '../shared/starter'
export type { StarterFiles } from '../shared/starter'

export function prepareStarter(dir: string): StarterFiles {
  mkdirSync(dir, { recursive: true })
  const notePath = join(dir, 'welcome.md')
  const imagePath = join(dir, 'welcome.png')
  const wrote: string[] = []
  if (!existsSync(notePath)) { writeFileSync(notePath, WELCOME_NOTE); wrote.push(notePath) }
  if (!existsSync(imagePath)) { writeFileSync(imagePath, Buffer.from(WELCOME_PNG_BASE64, 'base64')); wrote.push(imagePath) }
  return { notePath, imagePath, wrote }
}
