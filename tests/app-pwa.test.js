/**
 * The three Dearune apps.
 *
 * The manifests, the icons and the service workers are written by a script
 * from one list (src/pwa/apps.js). This test makes sure the files that
 * ship are the files the list describes — a manifest cannot drift away from
 * its own route, an icon cannot go missing, and no two apps can be given
 * the same scope by accident.
 */

import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { DEARUNE_APPS, DEARUNE_THEME, appForPath, appById } from '../src/pwa/apps.js'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const PUBLIC_DIR = join(ROOT, 'public')
const DIST_DIR = join(ROOT, 'dist')

/** The width and height of a PNG, read from its header. */
function pngSize(buffer) {
  const signature = buffer.subarray(0, 8).toString('hex')
  if (signature !== '89504e470d0a1a0a') throw new Error('not a PNG')
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

describe('the app registry', () => {
  it('holds three apps, each with its own identity', () => {
    expect(DEARUNE_APPS).toHaveLength(3)
    expect(new Set(DEARUNE_APPS.map((app) => app.id)).size).toBe(3)
    expect(new Set(DEARUNE_APPS.map((app) => app.name)).size).toBe(3)
    expect(new Set(DEARUNE_APPS.map((app) => app.shortName)).size).toBe(3)
  })

  it('gives every app a scope of its own, and none of them overlap', () => {
    const scopes = DEARUNE_APPS.map((app) => app.scope)
    expect(new Set(scopes).size).toBe(scopes.length)
    for (const scope of scopes) {
      const others = scopes.filter((other) => other !== scope)
      for (const other of others) {
        expect(other.startsWith(`${scope}/`)).toBe(false)
        expect(scope.startsWith(`${other}/`)).toBe(false)
      }
    }
  })

  it('opens every app at a section that already exists', () => {
    for (const app of DEARUNE_APPS) {
      expect(app.route).toMatch(/^\/admin\//)
      expect(app.startUrl).toBe(app.route)
      expect(app.scope).toBe(app.route)
    }
  })

  it('keeps the website out of the apps, and the apps out of the website', () => {
    expect(appForPath('/')).toBeNull()
    expect(appForPath('/admin/overview')).toBeNull()
    expect(appForPath('/admin/qa-scrap')).toBeNull()
    expect(appForPath('/admin/operations/print')?.id).toBe('operations')
    expect(appForPath('/admin/qa')?.id).toBe('qa')
    expect(appForPath('/admin/designers')?.id).toBe('designer')
    expect(appById('qa')?.name).toBe('Dearune QA')
    expect(appById('nothing')).toBeNull()
  })
})

describe('the manifests that ship', () => {
  for (const app of DEARUNE_APPS) {
    it(`${app.name} has a manifest of its own`, () => {
      const file = join(PUBLIC_DIR, app.manifestPath.replace(/^\//, ''))
      expect(existsSync(file)).toBe(true)

      const manifest = JSON.parse(readFileSync(file, 'utf8'))
      expect(manifest.id).toBe(app.scope)
      expect(manifest.name).toBe(app.name)
      expect(manifest.short_name).toBe(app.shortName)
      expect(manifest.description).toBe(app.description)
      expect(manifest.start_url).toBe(app.startUrl)
      expect(manifest.scope).toBe(app.scope)
      expect(manifest.display).toBe('standalone')
      expect(manifest.theme_color).toBe(DEARUNE_THEME.themeColor)
      expect(manifest.background_color).toBe(DEARUNE_THEME.backgroundColor)
    })

    it(`${app.name} points at icons that exist`, () => {
      const file = join(PUBLIC_DIR, app.manifestPath.replace(/^\//, ''))
      const manifest = JSON.parse(readFileSync(file, 'utf8'))

      expect(manifest.icons).toHaveLength(4)
      const purposes = manifest.icons.map((icon) => icon.purpose)
      expect(purposes).toContain('any')
      expect(purposes).toContain('maskable')

      for (const icon of manifest.icons) {
        const iconFile = join(PUBLIC_DIR, icon.src.replace(/^\//, ''))
        expect(existsSync(iconFile), `${icon.src} is missing`).toBe(true)
        const { width, height } = pngSize(readFileSync(iconFile))
        expect(width).toBe(Number.parseInt(icon.sizes, 10))
        expect(height).toBe(Number.parseInt(icon.sizes, 10))
        expect([192, 512]).toContain(width)
      }
    })
  }

  it('gives the three apps three different icons', () => {
    const files = DEARUNE_APPS.map((app) =>
      readFileSync(join(PUBLIC_DIR, app.iconPath.replace(/^\//, ''))),
    )
    const prints = files.map((file) => file.toString('base64'))
    expect(new Set(prints).size).toBe(3)
  })
})

describe('the service workers that ship', () => {
  for (const app of DEARUNE_APPS) {
    it(`${app.name} has a worker bound to its own section`, () => {
      const file = join(PUBLIC_DIR, app.workerPath.replace(/^\//, ''))
      expect(existsSync(file)).toBe(true)

      const source = readFileSync(file, 'utf8')
      expect(source).toContain(`const SECTION = '${app.scope}'`)
      expect(source).toContain(`const CACHE = '${app.workerCache}'`)
      // Nothing outside the section, nothing private, nothing from another origin.
      expect(source).toContain('url.origin !== self.location.origin')
      expect(source).toContain("url.pathname.startsWith('/api/')")
      expect(source).toContain('url.pathname.startsWith(SECTION)')
    })
  }

  it('keeps the three workers apart', () => {
    const sources = DEARUNE_APPS.map((app) =>
      readFileSync(join(PUBLIC_DIR, app.workerPath.replace(/^\//, '')), 'utf8'),
    )
    // Each worker mentions its own section and nobody else's.
    sources.forEach((source, index) => {
      const own = DEARUNE_APPS[index].scope
      const others = DEARUNE_APPS.filter((_, other) => other !== index).map((app) => app.scope)
      expect(source).toContain(`const SECTION = '${own}'`)
      for (const other of others) expect(source).not.toContain(other)
    })
  })
})

describe('the built site', () => {
  const built = existsSync(join(DIST_DIR, 'index.html'))

  it.skipIf(!built)('points each app at its own manifest before the app boots', () => {
    const html = readFileSync(join(DIST_DIR, 'index.html'), 'utf8')
    for (const app of DEARUNE_APPS) {
      expect(html).toContain(app.manifestPath)
    }
    // The switcher has to come after the website's own manifest link, or the
    // page would end up with two manifests and the browser would pick one.
    const mainLink = html.indexOf('rel="manifest"')
    const switcher = html.indexOf('data-dearune-app')
    expect(mainLink).toBeGreaterThan(-1)
    expect(switcher).toBeGreaterThan(mainLink)
  })

  it.skipIf(!built)('ships the manifests, the icons and the workers', () => {
    for (const app of DEARUNE_APPS) {
      expect(existsSync(join(DIST_DIR, app.manifestPath.replace(/^\//, '')))).toBe(true)
      expect(existsSync(join(DIST_DIR, app.workerPath.replace(/^\//, '')))).toBe(true)
      expect(existsSync(join(DIST_DIR, app.iconPath.replace(/^\//, '')))).toBe(true)
    }
  })

  it.skipIf(!built)('serves the manifests and the workers with the right headers', () => {
    const headers = readFileSync(join(DIST_DIR, '_headers'), 'utf8')
    expect(headers).toContain('/manifests/*.webmanifest')
    expect(headers).toContain('Content-Type: application/manifest+json')
    for (const app of DEARUNE_APPS) {
      expect(headers).toContain(app.workerPath)
      expect(headers).toContain(`Service-Worker-Allowed: ${app.scope}`)
      expect(headers).toContain('Cache-Control: no-cache')
    }
  })
})
