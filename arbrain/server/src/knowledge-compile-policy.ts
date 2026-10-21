import { existsSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'

function canonical(path: string): string {
  let ancestor = path
  const suffix: string[] = []
  while (!existsSync(ancestor)) {
    const parent = dirname(ancestor)
    if (parent === ancestor) return path
    suffix.unshift(relative(parent, ancestor)); ancestor = parent
  }
  return join(realpathSync(ancestor), ...suffix)
}
const within = (path: string, root: string) => path === root || (!relative(root, path).startsWith('..') && !isAbsolute(relative(root, path)))

/** Compile tools may observe source/wiki and write Markdown only inside the wiki. */
export function compileToolAllowed(tool: string, input: Record<string, unknown>, root: string, source: string): boolean {
  if (!['Read', 'Write', 'Edit', 'Glob', 'Grep'].includes(tool)) return false
  const raw = input.file_path ?? input.path
  if (typeof raw !== 'string' || !raw) return false
  const path = canonical(resolve(root, raw))
  const wiki = canonical(join(root, '.claude/knowledge'))
  if (tool === 'Write' || tool === 'Edit') return within(path, wiki) && path.endsWith('.md')
  if (within(path, wiki)) {
    if (tool === 'Read' && ['index.md', 'log.md'].some(name => path === join(wiki, name))) {
      if (typeof input.limit !== 'number' || input.limit < 1 || input.limit > 120) return false
    }
    if (tool === 'Grep' && (typeof input.head_limit !== 'number' || input.head_limit < 1 || input.head_limit > 40)) return false

    // Glob patterns must not escape an approved base through traversal or absolute paths.
    if (tool === 'Glob' && typeof input.pattern === 'string' && (isAbsolute(input.pattern) || input.pattern.split('/').includes('..'))) return false
    return true
  }
  return tool === 'Read' && [canonical(source), canonical(join(root, '.claude/AGENTS.md'))].includes(path)
}
