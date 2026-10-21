import { afterEach, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, symlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compileToolAllowed } from './knowledge-compile-policy.js'
const dirs: string[]=[]
function fixture(){const root=mkdtempSync(join(tmpdir(),'compile-policy-'));dirs.push(root);mkdirSync(join(root,'.claude/knowledge'),{recursive:true});return root}
afterEach(()=>{for(const d of dirs.splice(0))rmSync(d,{recursive:true,force:true})})
it('allows source reads and Markdown article updates',()=>{const r=fixture(),source=join(r,'source.md');expect(compileToolAllowed('Read',{file_path:source},r,source)).toBe(true);expect(compileToolAllowed('Write',{file_path:'.claude/knowledge/concepts/new.md'},r,source)).toBe(true)})
it('denies tools outside the compiler and writes to source or memory',()=>{const r=fixture(),source=join(r,'source.md');for(const [tool,path] of [['Bash','.claude/knowledge/x.md'],['Write',source],['Edit','.claude/memory/MEMORY.md'],['Read','.env'],['Write','.claude/knowledge/../../.env']])expect(compileToolAllowed(tool,{file_path:path},r,source)).toBe(false)})
it('denies symlink escape and non-Markdown artifacts',()=>{const r=fixture();symlinkSync(tmpdir(),join(r,'.claude/knowledge/escape'));expect(compileToolAllowed('Write',{file_path:'.claude/knowledge/escape/out.md'},r,'source')).toBe(false);expect(compileToolAllowed('Write',{file_path:'.claude/knowledge/run.sh'},r,'source')).toBe(false)})
it('requires explicit search scope and rejects glob traversal',()=>{const r=fixture();expect(compileToolAllowed('Glob',{pattern:'**/*.md'},r,'source')).toBe(false);expect(compileToolAllowed('Glob',{path:'.claude/knowledge',pattern:'../../*'},r,'source')).toBe(false);expect(compileToolAllowed('Grep',{path:'.claude/knowledge',pattern:'decision',head_limit:30},r,'source')).toBe(true)})

it('requires bounded catalog reads and searches without restricting article access',()=>{const r=fixture();for(const name of ['index.md','log.md']) {expect(compileToolAllowed('Read',{file_path:'.claude/knowledge/'+name},r,'source')).toBe(false);expect(compileToolAllowed('Read',{file_path:'.claude/knowledge/'+name,limit:120},r,'source')).toBe(true)}expect(compileToolAllowed('Read',{file_path:'.claude/knowledge/concepts/x.md'},r,'source')).toBe(true);expect(compileToolAllowed('Grep',{path:'.claude/knowledge',pattern:'x'},r,'source')).toBe(false);expect(compileToolAllowed('Grep',{path:'.claude/knowledge',pattern:'x',head_limit:41},r,'source')).toBe(false)})
