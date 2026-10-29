import {it,expect} from 'vitest'
import {SpeechFrames} from './speech.js'
it('frames survive arbitrary pipe boundaries without losing ids or final marker',()=>{
 const first=Buffer.alloc(16);first.writeUInt32LE(7,0);first.writeUInt32LE(4,4);first.writeUInt32LE(22050,8);first.writeInt16LE(100,12);first.writeInt16LE(-100,14)
 const last=Buffer.alloc(12);last.writeUInt32LE(7,0);const raw=Buffer.concat([first,last])
 for(let size=1;size<20;size++){const parser=new SpeechFrames(),got=[];for(let i=0;i<raw.length;i+=size)got.push(...parser.push(raw.subarray(i,i+size)));expect(got).toHaveLength(2);expect(got[0].rate).toBe(22050);expect(got[0].data.readInt16LE(0)).toBe(100);expect(got[1].data.length).toBe(0)}
})
it('a word marker (rate 1, 12 bytes) parses like any frame and keeps its range and sample',()=>{
 const m=Buffer.alloc(24);m.writeUInt32LE(9,0);m.writeUInt32LE(12,4);m.writeUInt32LE(1,8);m.writeUInt32LE(18,12);m.writeUInt32LE(5,16);m.writeUInt32LE(68608/4,20)
 const [f]=new SpeechFrames().push(m);expect(f.rate).toBe(1);expect([f.data.readUInt32LE(0),f.data.readUInt32LE(4),f.data.readUInt32LE(8)]).toEqual([18,5,17152])
})
