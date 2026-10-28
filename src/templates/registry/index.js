import { MEMORIAL_TEMPLATE_V1 } from '../memorial-message/v1'
import { TEMPLATE_SEQUENCES } from '../stages'

// Centralized registry of all templates and their versions
// Each template has a default/current version and available versions

const TEMPLATE_DEFINITIONS = {
  'memorial-message': {
    slug: 'memorial-message',
    name: 'Memorial Message',
    defaultVersion: 1,
    versions: {
      1: {
        version: 1,
        module: MEMORIAL_TEMPLATE_V1,
        manifest: {
          template: 'memorial-message',
          version: 1,
          name: 'Memorial Message',
          description: 'A single preserved letter in English or Arabic with three pinned prints and optionally a sound.',
          renderAspectRatio: 3 / 4,
        },
        // Derive from stages for this slug
        stages: [...(TEMPLATE_SEQUENCES['memorial-message'] ?? [])],
      },
    },
  },
}

// In-memory/current version overrides (can be extended with persistence later)
const currentVersionOverrides = {}

export function getTemplateVersions(slug) {
  const def = TEMPLATE_DEFINITIONS[slug]
  if (!def) return []
  return Object.keys(def.versions)
    .map((v) => Number(v))
    .sort((a, b) => a - b)
}

export function getCurrentTemplateVersion(slug) {
  if (currentVersionOverrides[slug]) {
    const v = currentVersionOverrides[slug]
    // Validate it's registered
    if (TEMPLATE_DEFINITIONS[slug]?.versions[v]) {
      return v
    }
  }
  const def = TEMPLATE_DEFINITIONS[slug]
  if (!def) return null
  return def.defaultVersion
}

export function setCurrentTemplateVersion(slug, version) {
  const def = TEMPLATE_DEFINITIONS[slug]
  if (!def) throw new Error(`Unknown template: ${slug}`)
  if (!def.versions[version]) throw new Error(`Version ${version} not registered for ${slug}`)
  currentVersionOverrides[slug] = version
  return version
}

export function resolveTemplateVersion(slug, version) {
  const def = TEMPLATE_DEFINITIONS[slug]
  if (!def) return null
  const targetVersion = version != null ? Number(version) : getCurrentTemplateVersion(slug)
  // If version not specified or invalid, fall back to current/default
  if (targetVersion == null || !def.versions[targetVersion]) {
    const fallback = getCurrentTemplateVersion(slug)
    if (fallback && def.versions[fallback]) {
      return def.versions[fallback]
    }
    // Last resort: use v1 if exists
    if (def.versions[1]) return def.versions[1]
    return null
  }
  return def.versions[targetVersion]
}

export function getTemplate(slug, version) {
  const resolved = resolveTemplateVersion(slug, version)
  if (!resolved) return null
  return resolved.module
}

export function templateRegistry(slug, version) {
  return getTemplate(slug, version)
}

// For backward compatibility
export function templateRegistryLegacy(slug) {
  return getTemplate(slug)
}

export function getTemplateManifest(slug, version) {
  const resolved = resolveTemplateVersion(slug, version)
  if (!resolved) return null
  return resolved.manifest
}

export function isVersionRegistered(slug, version) {
  const def = TEMPLATE_DEFINITIONS[slug]
  if (!def) return false
  return Boolean(def.versions[Number(version)])
}

export function listTemplates() {
  const result = []
  for (const [slug, def] of Object.entries(TEMPLATE_DEFINITIONS)) {
    result.push({
      slug,
      name: def.name,
      defaultVersion: def.defaultVersion,
      currentVersion: getCurrentTemplateVersion(slug),
      versions: getTemplateVersions(slug),
    })
  }
  return result
}

// Re-export for compatibility
export { TEMPLATE_SEQUENCES } from '../stages'
