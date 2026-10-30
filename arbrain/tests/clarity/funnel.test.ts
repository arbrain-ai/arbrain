import {test} from 'node:test'
import assert from 'node:assert/strict'
import {addFunnelEvents,createFunnelSessions} from '../../src/features/clarity/funnel-model'
test('repeated pageviews count one session per stage, missing IDs are explicit, access checks excluded',()=>{
 const state=createFunnelSessions()
 addFunnelEvents(state,[{event_name:'about_page_view',session_id:'a'},{event_name:'about_page_view',session_id:'a'},{event_name:'about_page_view',session_id:null},{event_name:'payment_verified',session_id:'b'}])
 addFunnelEvents(state,[{event_name:'about_page_view',session_id:'a'},{event_name:'checkout_page_view',session_id:'a'},{event_name:'checkout_page_view',session_id:'c'}])
 assert.equal(state.stages.about_page_view.size,1)
 assert.equal(state.stages.checkout_page_view.size,2) // no fake sequential conversion rate
 assert.equal(state.withoutSession,1)
 assert.equal(state.stages.payment_verified,undefined)
})
