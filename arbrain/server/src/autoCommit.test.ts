import { afterEach, expect, it } from 'vitest'
import { execFileSync } from 'child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { publishCronChanges } from './autoCommit.js'
const dirs: string[] = []
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim()
function fixture() {
 const dir = mkdtempSync(join(tmpdir(), 'publisher-test-')); dirs.push(dir)
 const remote = join(dir, 'remote.git'), root = join(dir, 'work')
 git(dir, 'init', '--bare', remote); git(dir, 'clone', remote, root)
 git(root, 'config', 'user.name', 'Test'); git(root, 'config', 'user.email', 'test@example.invalid'); git(root, 'checkout', '-b', 'main')
 writeFileSync(join(root, 'README'), 'baseline'); git(root, 'add', 'README'); git(root, 'commit', '-m', 'initial'); git(root, 'push', '-u', 'origin', 'main')
 mkdirSync(join(root, '.claude/memory'), { recursive: true }); return { dir, root, remote }
}
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }) })
it('publishes literal filenames without taking unrelated WIP', () => {
 const { root, remote } = fixture(); const name = '.claude/memory/$(touch SHOULD_NOT_EXIST).md'
 writeFileSync(join(root, name), 'knowledge'); writeFileSync(join(root, 'README'), 'manual WIP')
 expect(publishCronChanges(root, 'daily')).toMatch(/^published/)
 expect(git(remote, 'show', `main:${name}`)).toBe('knowledge'); expect(git(remote, 'show', 'main:README')).toBe('baseline')
 expect(readFileSync(join(root, 'README'), 'utf8')).toBe('manual WIP'); expect(git(root, 'diff', '--cached', '--name-only')).toBe('')
})
it('preserves existing staging byte-for-byte', () => {
 const { root } = fixture(); writeFileSync(join(root, 'README'), 'staged'); git(root, 'add', 'README'); const before = readFileSync(join(root, '.git/index'))
 writeFileSync(join(root, '.claude/memory/new.md'), 'new'); expect(publishCronChanges(root, 'daily')).toContain('existing staged')
 expect(readFileSync(join(root, '.git/index'))).toEqual(before)
})
it('retries rejected push with no new dirty files', () => {
 const { root, remote } = fixture(); const hook = join(remote, 'hooks/pre-receive')
 writeFileSync(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 }); writeFileSync(join(root, '.claude/memory/new.md'), 'new')
 expect(() => publishCronChanges(root, 'daily')).toThrow(); expect(git(root, 'status', '--porcelain')).toBe('')
 writeFileSync(hook, '#!/bin/sh\nexit 0\n'); expect(publishCronChanges(root, 'retry')).toBe('published 1 commit(s)')
 expect(git(remote, 'rev-parse', 'main')).toBe(git(root, 'rev-parse', 'HEAD'))
})
it('preserves staged files on commit rejection', () => {
 const { root } = fixture(); writeFileSync(join(root, '.git/hooks/pre-commit'), '#!/bin/sh\nexit 1\n', { mode: 0o755 })
 writeFileSync(join(root, '.claude/memory/new.md'), 'new'); expect(() => publishCronChanges(root, 'daily')).toThrow()
 expect(git(root, 'diff', '--cached', '--name-only')).toBe('.claude/memory/new.md')
})
it('does not publish manual local commits', () => {
 const { root, remote } = fixture(); const before = git(remote, 'rev-parse', 'main')
 writeFileSync(join(root, 'README'), 'draft'); git(root, 'add', 'README'); git(root, 'commit', '-m', 'unfinished manual change')
 expect(publishCronChanges(root, 'daily')).toContain('manual commits'); expect(git(remote, 'rev-parse', 'main')).toBe(before)
})
it('preserves divergence and WIP without stash or rebase', () => {
 const { root, remote, dir } = fixture(); const other = join(dir, 'other')
 git(dir, 'clone', '-b', 'main', remote, other); git(other, 'config', 'user.name', 'Other'); git(other, 'config', 'user.email', 'other@example.invalid')
 writeFileSync(join(other, 'remote'), 'remote'); git(other, 'add', '.'); git(other, 'commit', '-m', 'remote'); git(other, 'push')
 writeFileSync(join(root, 'local'), 'local'); git(root, 'add', 'local'); git(root, 'commit', '-m', 'auto(test): local')
 writeFileSync(join(root, 'README'), 'WIP'); const before = git(root, 'rev-parse', 'HEAD')
 expect(publishCronChanges(root, 'daily')).toContain('diverged'); expect(git(root, 'rev-parse', 'HEAD')).toBe(before)
 expect(readFileSync(join(root, 'README'), 'utf8')).toBe('WIP'); expect(git(root, 'stash', 'list')).toBe('')
})
it('rejects an unpublished submodule commit even without upstream', () => {
 const { root, remote, dir } = fixture(); const sub = join(root, 'negocio/saas-factory-community')
 git(root, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-b', 'main', remote, 'negocio/saas-factory-community')
 git(root, 'commit', '-m', 'register submodule'); git(root, 'push')
 git(sub, 'config', 'user.name', 'Test'); git(sub, 'config', 'user.email', 'test@example.invalid')
 git(sub, 'checkout', '--detach'); writeFileSync(join(sub, 'unpublished'), 'unique')
 git(sub, 'add', 'unpublished'); git(sub, 'commit', '-m', 'not on remote')
 const before = git(root, 'rev-parse', 'HEAD')
 expect(publishCronChanges(root, 'daily')).toContain('submodule commit is not published')
 expect(git(root, 'rev-parse', 'HEAD')).toBe(before)
 expect(git(root, 'diff', '--cached', '--name-only')).toBe('')
})

it('does not publish knowledge while another cron is compiling it', () => {
 const { root, remote } = fixture()
 mkdirSync(join(root, '.claude/knowledge'), { recursive: true })
 mkdirSync(join(root, '.claude/hooks/tmp'), { recursive: true })
 const lock = join(root, '.claude/hooks/tmp/compile.lock')
 writeFileSync(lock, String(Date.now()))
 writeFileSync(join(root, '.claude/knowledge/partial.md'), 'partial wiki')
 writeFileSync(join(root, '.claude/memory/complete.md'), 'finished memory')
 expect(publishCronChanges(root, 'other-cron')).toMatch(/^published/)
 expect(git(remote, 'ls-tree', '-r', '--name-only', 'main')).not.toContain('partial.md')
 expect(git(remote, 'show', 'main:.claude/memory/complete.md')).toBe('finished memory')
 expect(readFileSync(join(root, '.claude/knowledge/partial.md'), 'utf8')).toBe('partial wiki')
 rmSync(lock)
 writeFileSync(join(root, '.claude/knowledge/partial.md'), 'complete wiki')
 expect(publishCronChanges(root, 'knowledge-compile')).toMatch(/^published/)
 expect(git(remote, 'show', 'main:.claude/knowledge/partial.md')).toBe('complete wiki')
})
