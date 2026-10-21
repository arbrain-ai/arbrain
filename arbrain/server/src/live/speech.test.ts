import {it,expect} from 'vitest'
import {SpeechFrames} from './speech.js'
it('frames survive arbitrary pipe boundaries without losing ids or final marker',()=>{
 const first=Buffer.alloc(16);first.writeUInt32LE(7,0);first.writeUInt32LE(4,4);first.writeUInt32LE(22050,8);first.writeInt16LE(100,12);first.writeInt16LE(-100,14)
 const last=Buffer.alloc(12);last.writeUInt32LE(7,0);const raw=Buffer.concat([first,last])
 for(let size=1;size<20;size++){const parser=new SpeechFrames(),got=[];for(let i=0;i<raw.length;i+=size)got.push(...parser.push(raw.subarray(i,i+size)));expect(got).toHaveLength(2);expect(got[0].rate).toBe(22050);expect(got[0].data.readInt16LE(0)).toBe(100);expect(got[1].data.length).toBe(0)}
})
