import {test} from 'node:test'
import assert from 'node:assert/strict'
import {settleQuestions} from '../../src/features/chat/lib/question-lifecycle.ts'
test('terminal reconciliation expires unanswered questions without discarding confirmed answers',()=>{
 const pending={requestId:'a',questions:[],status:'pending' as const}
 const answered={requestId:'b',questions:[],status:'answered' as const,answers:{Color:'Violeta'}}
 const result=settleQuestions([pending,answered])
 assert.equal(result[0].status,'timeout');assert.equal(result[1],answered)
 assert.equal(pending.status,'pending');assert.deepEqual(settleQuestions(result),result)
})
