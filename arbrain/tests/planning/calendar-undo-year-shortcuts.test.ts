import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {inverseFor,UndoHistory,UNDO_LIMIT} from '../../src/features/planning/undo'
import {buildMonth,buildYear,dayLoad,intensity,isRoutine,yearLoad,yearWindows} from '../../src/features/planning/year'
import {calendarAction,CALENDAR_SHORTCUTS} from '../../src/features/planning/shortcuts'
import {eventData} from '../../src/features/planning/model'
import type {PlanEvent,PlanMutation,PlanTask} from '../../src/features/planning/types'

const ev=(extra:Partial<PlanEvent>={}):PlanEvent=>({id:'google:s:e1',externalId:'e1',kind:'event',sourceId:'s',account:'a@x',calendarId:'cal',title:'Prueba',description:'',location:'',start:'2027-01-15T09:00:00.000Z',end:'2027-01-15T10:00:00.000Z',allDay:false,timeZone:'America/Mexico_City',etag:'"v1"',recurringEventId:null,recurrence:[],editable:true,...extra})
const task=(extra:Partial<PlanTask>={}):PlanTask=>({id:'todoist:t1',externalId:'t1',kind:'task',title:'Tarea',description:'',projectId:null,sectionId:null,parentId:null,priority:4,due:'2027-01-15',timeZone:null,recurring:false,recurrenceText:null,durationMinutes:null,completed:false,updatedAt:'u1',...extra})
const op=(o:Partial<PlanMutation>):PlanMutation=>({requestId:'r',ownerId:'owner',kind:'event',action:'update',...o})

test('undo of create deletes the event using the etag of NOW, not the one at creation',()=>{
  const created=ev({etag:'"old"'}),current=ev({etag:'"new"'})
  const entry=inverseFor(op({action:'create',account:'a@x',calendarId:'cal'}),undefined,{ok:true,event:created})!
  const m=entry.build([current],new Map())!
  assert.equal(m.action,'delete');assert.equal(m.etag,'"new"');assert.equal(m.externalId,'e1');assert.equal(m.ownerId,'owner')
  assert.equal(entry.build([],new Map())!.etag,'"old"','out of the loaded window it falls back to the confirmed etag')
})
test('undo of an edit restores the previous values on the current etag',()=>{
  const before=ev({title:'Antes',start:'2027-01-15T09:00:00.000Z'}),after=ev({title:'Después',etag:'"v2"'})
  const entry=inverseFor(op({action:'update',externalId:'e1',account:'a@x',calendarId:'cal'}),before,{ok:true,event:after})!
  const m=entry.build([after],new Map())!
  assert.equal(m.action,'update');assert.equal(m.etag,'"v2"');assert.deepEqual(m.data,eventData(before))
})
test('undo of a recurring occurrence edit stays scoped to that occurrence',()=>{
  const before=ev({recurringEventId:'series'}),after=ev({recurringEventId:'series',etag:'"v2"'})
  const m=inverseFor(op({action:'update'}),before,{ok:true,event:after})!.build([after],new Map())!
  assert.equal(m.scope,'occurrence')
})
test('undo of delete recreates the event and re-points later entries to the new id',()=>{
  const before=ev(),aliases=new Map<string,string>()
  const entry=inverseFor(op({action:'delete',externalId:'e1',account:'a@x',calendarId:'cal'}),before,{ok:true,deletedId:'e1'})!
  const m=entry.build([],aliases)!
  assert.equal(m.action,'create');assert.equal(m.account,'a@x');assert.equal(m.calendarId,'cal');assert.deepEqual(m.data,eventData(before))
  entry.after!({ok:true,event:ev({externalId:'e2',id:'google:s:e2'})},aliases)
  const later=inverseFor(op({action:'update'}),before,{ok:true,event:before})!
  const cur=ev({externalId:'e2',id:'google:s:e2',etag:'"n"'})
  assert.equal(later.build([cur],aliases)!.externalId,'e2')
})
test('what the provider cannot restore says so instead of undoing something else',()=>{
  const occ=inverseFor(op({action:'delete'}),ev({recurringEventId:'series'}),{ok:true,deletedId:'e1'})!
  assert.ok(occ.irreversible);assert.equal(occ.build([],new Map()),null)
  assert.ok(inverseFor(op({kind:'task',action:'create',data:{title:'x'}}),undefined,{ok:true,task:task()})!.irreversible)
  assert.ok(inverseFor(op({kind:'task',action:'complete'}),task({recurring:true}),{ok:true,completedId:'t1'})!.irreversible)
})
test('undo of completing a task reopens it; undo of a task edit restores it',()=>{
  const reopen=inverseFor(op({kind:'task',action:'complete',externalId:'t1'}),task(),{ok:true,completedId:'t1'})!.build([],new Map())!
  assert.equal(reopen.action,'reopen');assert.equal(reopen.externalId,'t1')
  const restore=inverseFor(op({kind:'task',action:'update',externalId:'t1'}),task({due:'2027-01-15'}),{ok:true,task:task({due:'2027-01-16',updatedAt:'u2'})})!.build([task({due:'2027-01-16',updatedAt:'u2'})],new Map())!
  assert.equal(restore.action,'update');assert.equal(restore.updatedAt,'u2');assert.equal(restore.data!.due,'2027-01-15')
})
test('history is a bounded stack',()=>{
  const h=new UndoHistory();const entry=(n:number)=>({label:String(n),build:()=>null})
  for(let i=0;i<UNDO_LIMIT+5;i++)h.push(entry(i))
  assert.equal(h.size,UNDO_LIMIT);assert.equal(h.pop()!.label,String(UNDO_LIMIT+4))
  const e=h.pop()!;h.restore(e);assert.equal(h.pop()!.label,e.label);h.push(null);assert.equal(h.size,UNDO_LIMIT-2)
})

test('months are whole Monday-first weeks',()=>{
  const oct=buildMonth(2026,9)
  assert.equal(oct.days.length%7,0);assert.equal(oct.days[0].key,'2026-09-28');assert.equal(oct.days.at(-1)!.key,'2026-11-01')
  assert.equal(oct.days.filter(d=>d.inMonth).length,31);assert.equal(buildYear(2027).length,12)
  assert.equal(buildMonth(2026,5).days[0].key,'2026-06-01')
  assert.equal(buildMonth(2028,1).days.filter(d=>d.inMonth).length,29)
})
test('year reads are contiguous windows under the provider limit',()=>{
  const w=yearWindows(2027);assert.equal(w.length,6)
  for(const x of w)assert.ok((Date.parse(x.to)-Date.parse(x.from))/86400000<=62)
  for(let i=1;i<w.length;i++)assert.equal(w[i].from,w[i-1].to)
  assert.equal(w[0].from,new Date(2027,0,1).toISOString());assert.equal(w.at(-1)!.to,new Date(2028,0,1).toISOString())
})
test('day load counts every day of a long event and respects the exclusive end',()=>{
  const l=dayLoad([{start:'2027-03-01',end:'2027-03-04'},{start:new Date(2027,2,2,9).toISOString(),end:new Date(2027,2,2,10).toISOString()},{start:new Date(2027,2,5,22).toISOString(),end:new Date(2027,2,6,2).toISOString()}])
  assert.equal(l.get('2027-03-01'),1);assert.equal(l.get('2027-03-02'),2);assert.equal(l.get('2027-03-03'),1);assert.equal(l.get('2027-03-04'),undefined)
  assert.equal(l.get('2027-03-05'),1);assert.equal(l.get('2027-03-06'),1)

})

const key=(k:string,x:Record<string,boolean>={})=>calendarAction({key:k,metaKey:false,ctrlKey:false,altKey:false,shiftKey:false,...x})
test('numbers pick views, letters and E/R create, ⌘Z undoes',()=>{
  assert.deepEqual(key('1'),{type:'mode',mode:'day'});assert.deepEqual(key('5'),{type:'mode',mode:'year'});assert.deepEqual(key('7'),{type:'mode',mode:'crons'})
  assert.deepEqual(key('y'),{type:'mode',mode:'year'});assert.deepEqual(key('E'),{type:'new',kind:'event'});assert.deepEqual(key('n'),{type:'new',kind:'event'});assert.deepEqual(key('r'),{type:'new',kind:'task'})
  assert.deepEqual(key('.'),{type:'today'});assert.deepEqual(key('Delete'),{type:'delete'});assert.deepEqual(key('Backspace'),{type:'delete'})
  assert.deepEqual(key('z',{metaKey:true}),{type:'undo'});assert.deepEqual(key('z',{ctrlKey:true}),{type:'undo'})
})
test('shortcuts never steal the global ones',()=>{
  for(const d of '1234567')assert.equal(key(d,{ctrlKey:true}),null,'Ctrl+digit navigates areas')
  for(const k of ['[','?'])assert.equal(key(k),null,'sidebar and help stay global')
  // T = hoy dentro del calendario (10 oct 2026); el tema la respeta por preventDefault y sigue con ⌘⌥T en todas partes.
  assert.deepEqual(key('t'),{type:'today'});assert.equal(key('t',{metaKey:true,altKey:true}),null)
  assert.deepEqual(key('z',{metaKey:true,shiftKey:true}),{type:'redo'});assert.deepEqual(key('z',{ctrlKey:true,shiftKey:true}),{type:'redo'});assert.equal(key('z',{metaKey:true,altKey:true}),null);assert.equal(key('1',{altKey:true}),null);assert.equal(key('d',{metaKey:true}),null);assert.equal(key('!',{shiftKey:true}),null)
  assert.equal(calendarAction({key:'1',metaKey:false,ctrlKey:false,altKey:false,shiftKey:false,isComposing:true}),null)
  assert.ok(CALENDAR_SHORTCUTS.length>=6)
})

test('year colour ignores routines and scales by the busiest day of the year',()=>{
  const day=(d:string,extra:object={})=>({start:`${d}T10:00:00`,end:`${d}T11:00:00`,recurringEventId:null,recurrence:[] as string[],...extra})
  const rows=[day('2027-03-01',{recurringEventId:'wake'}),day('2027-03-02',{recurringEventId:'wake'}),day('2027-03-02',{recurrence:['RRULE:FREQ=DAILY']}),
    day('2027-03-02'),day('2027-03-02'),day('2027-03-02'),day('2027-03-02'),day('2027-03-05'),day('2027-03-06'),day('2027-03-06')]
  assert.equal(isRoutine(rows[0]),true);assert.equal(isRoutine(rows[3]),false)
  const {load,max}=yearLoad(rows)
  assert.equal(load.get('2027-03-01'),undefined,'a day with only routines reads as empty');assert.equal(load.get('2027-03-02'),4);assert.equal(max,4)
  assert.equal(intensity(0,max),0);assert.equal(intensity(1,max),1);assert.equal(intensity(2,max),2);assert.equal(intensity(4,max),4)
  assert.equal(intensity(1,100),1,'any real event is visible even in a huge year');assert.equal(intensity(5,0),0)
})
test('redo: the inverse of the inverse is the original action, and a new action kills redo',()=>{
  const a=ev({title:'A'}),b=ev({title:'B',etag:'"v2"'})
  const undoEntry=inverseFor(op({action:'update',externalId:'e1',account:'a@x',calendarId:'cal'}),a,{ok:true,event:b})!
  const undoOp=undoEntry.build([b],new Map())!
  const redoEntry=inverseFor(undoOp,b,{ok:true,event:ev({title:'A',etag:'"v3"'})})!
  const redoOp=redoEntry.build([ev({title:'A',etag:'"v3"'})],new Map())!
  assert.equal(redoOp.action,'update');assert.equal(redoOp.etag,'"v3"');assert.equal((redoOp.data as {title:string}).title,'B')
  const reopen=inverseFor(op({kind:'task',action:'reopen',externalId:'t1'}),undefined,{ok:true,task:task()})!.build([],new Map())!
  assert.equal(reopen.action,'complete');assert.equal(reopen.externalId,'t1')
  const h=new UndoHistory();h.push(undoEntry);const popped=h.pop()!;h.pushRedo(redoEntry);assert.equal(h.redoSize,1)
  h.pushUndo(popped);assert.equal(h.redoSize,1,'redoing back into undo keeps the rest of redo')
  h.push(undoEntry);assert.equal(h.redoSize,0,'a fresh user action clears redo');assert.equal(h.popRedo(),undefined)
})
