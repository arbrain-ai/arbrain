import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {ownerIds,perfilDelTurno} from '../../src/features/avisos/server'
import {getRoleForEmail,isEmailAllowed} from '../../src/lib/auth-config'
import {canAccessRoute} from '../../src/lib/permissions'
import {conversationScope} from '../../src/lib/chat-access-policy'
import {LOCAL_DESKTOP_EMAIL,LOCAL_DESKTOP_USER_ID} from '../../src/lib/desktop-auth'
import {instalacion} from '../../src/config'

// Los correos y roles salen de la configuración de la instalación (src/config): la prueba no escribe datos de nadie.
test('cada correo permitido entra con su rol (los owner, con los mismos permisos que la persona dueña)',()=>{
  const permitidos=instalacion().correosPermitidos
  assert.ok(permitidos.length>0,'toda instalación tiene al menos a su persona dueña')
  for(const {correo,rol} of permitidos){
    // En mayúsculas también: el correo se compara sin distinguir.
    assert.equal(isEmailAllowed(correo.toUpperCase()),true)
    assert.equal(getRoleForEmail(correo.toUpperCase()),rol)
  }
  assert.equal(isEmailAllowed('extrano@example.test'),false)
  assert.equal(getRoleForEmail('extrano@example.test'),'member')
  // Todo perfil owner (la persona dueña y, si la hay, la segunda persona) entra con los mismos permisos.
  for(const ruta of ['/chat','/hoy','/sistema','/finanzas','/youtube','/segundo-cerebro'])assert.equal(canAccessRoute(ruta,'owner'),true)
})

test('el buzón sin destinatario es de la persona dueña, no de todo perfil owner',async()=>{
  const filtros:Record<string,string>={}
  const q:any={select:()=>q,eq:(k:string,v:string)=>{filtros[k]=v;return q},then:(ok:(r:unknown)=>void)=>ok({data:[{id:'dueno-id'}]})}
  const ids=await ownerIds({from:()=>q} as never)
  assert.deepEqual(ids,['dueno-id'])
  assert.equal(filtros.role,'owner')
  assert.equal(filtros.email,LOCAL_DESKTOP_EMAIL)
})

test('el dueño del turno solo vale si es un perfil real',()=>{
  const socio='3f2b8c1e-5a6d-4e7f-9a0b-1c2d3e4f5a6b'
  assert.equal(perfilDelTurno(socio),socio)
  assert.equal(perfilDelTurno(LOCAL_DESKTOP_USER_ID),null)
  assert.equal(perfilDelTurno('sdk:abc'),null)
  assert.equal(perfilDelTurno(undefined),null)
})

test('la segunda persona no ve el chat de la persona dueña ni las conversaciones sin dueño',()=>{
  const socio={id:'socio-id',personalOwner:false,owner:true}
  assert.throws(()=>conversationScope(socio,{id:'c1',profile_id:'dueno-id',account:'default'}),/no encontrada/)
  assert.throws(()=>conversationScope(socio,{id:'c2',profile_id:null,account:'default'}),/no encontrada/)
  assert.equal(conversationScope(socio,{id:'c3',profile_id:'socio-id',account:'default'}).owner,'socio-id')
})
