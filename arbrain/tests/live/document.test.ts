import test from 'node:test'
import assert from 'node:assert/strict'
import { artifactDocument } from '../../src/features/live/scene/document.ts'
import type {Artifact} from '../../src/features/live/scene/model.ts'
const artifact:Artifact={id:'one',title:'Test',frame:{x:0,y:0,width:100,height:100},html:'</script><script>alert(1)</script>',program:'return "<p>new shape</p>"',data:null,pinned:false,sources:[],evidence:'scenario'}
test('payload cannot terminate trusted script and generated execution is bounded in a worker',()=>{
 const doc=artifactDocument(artifact,'12345678-1234-1234-1234-123456789012')
 assert.equal((doc.match(/<script /g)||[]).length,1)
 assert.equal((doc.match(/<\/script>/g)||[]).length,1)
 assert.ok(doc.includes("connect-src 'none'"));assert.ok(doc.includes("frame-src 'none'"));assert.ok(doc.includes('worker.terminate()'));assert.ok(doc.includes('1200'))
})
test('frame token cannot inject a CSP directive or markup',()=>{
 assert.throws(()=>artifactDocument(artifact,'x" onclick="attack'),/Invalid frame token/)
})
