# Correo: la infraestructura que decide todo lo demás

> **Si no llegas a la bandeja, ningún texto te salva.** Es la primera de las tres patas (entrega, lista, texto) y la
> que la gente se salta porque es aburrida. Camino crítico: **3 a 4 semanas de calentamiento**, así que es lo primero
> que se arranca.

## 1. La arquitectura

```
Dominio principal del dueño  ──► JAMÁS se usa para frío. Es el activo.
    │
    └── Dominios SECUNDARIOS (1 a 5, según la lista)  ──► de aquí sale todo
            └── 2 a 3 buzones cada uno  ──► unos 30 envíos al día por buzón, máximo
```

**Por qué dominios aparte:** si un dominio se quema por reportes de spam, se apaga y se reemplaza. Si se quema el
principal, se cae el correo del negocio entero, incluido el de sus clientes.

**Nombres:** variantes cercanas y creíbles del principal (`usa<marca>.com`, `<marca>hq.com`). Nada genérico tipo
`mejoresclientes-ya.com`, que nace con mala fama. Comprarlos y pagar buzones es gasto: lo decide el dueño.

**Cuánto:** 30 envíos al día por buzón es el techo prudente. Para 300 al día se necesitan unos 10 buzones, no uno
mandando 300. Pero primero dimensiona con la lista (`listas.md` §7): en local casi siempre basta un dominio.

## 2. Los tres registros, sin excepción

| Registro | Qué hace | Si falta |
|---|---|---|
| **SPF** | Declara qué servidores pueden enviar por ti | Vas a spam casi seguro |
| **DKIM** | Firma criptográfica del correo | Vas a spam casi seguro |
| **DMARC** | Qué hacer si SPF o DKIM fallan | Los grandes proveedores lo exigen para enviar |

Se configuran una vez por dominio en el DNS. Levy puede guiar paso a paso o ponerlos si el dueño le da acceso a su
proveedor de dominios; comprobarlos después con una herramienta pública de revisión de DNS.

## 3. El calentamiento (no se puede acelerar)

Un buzón nuevo mandando 50 correos el primer día es bandera roja automática.

```
Semana 1:   5 a 10 correos al día
Semana 2:  10 a 20
Semana 3:  20 a 30
Semana 4:  listo para campañas
```

Durante el calentamiento el buzón intercambia correos con otros buzones reales que abren y responden. Las plataformas
de envío lo traen incluido. **Anota en `plan.md` la fecha en que empezó:** no se manda nada antes de 3 a 4 semanas.

Por eso comprar dominios es lo primero. Lista, texto y regalo se construyen mientras calientan. Si se deja para el
final, se pierde un mes.

## 4. Qué NUNCA va en un correo en frío

Cada uno es una huella que le dice al filtro «esto es marketing masivo». `frio.py revisar` busca la mayoría.

| Prohibido | Por qué |
|---|---|
| **Enlaces de rastreo y píxeles de apertura** | La huella más delatora. Y las tasas de apertura ya no son confiables |
| **Imágenes, logos, firmas con HTML** | De persona a persona es texto plano |
| **Enlace de calendario en el primer correo** | Pide compromiso antes de dar valor (`copy.md` §3) |
| **«Responde STOP para no recibir más»** | Es literalmente la marca de un envío masivo |
| **Palabras trampa** | garantizado, 100%, gratis en el asunto, urgente, oferta, $$$ |
| **Varios enlaces** | Uno como máximo, y solo cuando ya respondió |

Las leyes de correo comercial de cada país (identificarse, dar una forma de no recibir más) se cumplen con una línea
humana en el último correo de la secuencia o al responder, nunca con un pie masivo. Si el dueño vende a países con
reglas más estrictas, revisa la regla de ese país antes del primer lote.

## 5. Variación del texto (obligatoria)

Mandar el mismo texto exacto miles de veces es la forma más rápida de que los filtros lo aprendan. Cada correo sale con
palabras ligeramente distintas:

```
{Hola|Buenas|Qué tal} {nombre}, {vi que|noté que|me topé con que} {tu negocio|tu despacho} …
```

Dos trampas medidas:

1. Generar variantes con IA sin revisarlas mete palabras trampa sin que te enteres.
2. Algunas combinaciones producen frases sin sentido. **Se leen todas las variantes antes de enviar.** Sin excepción.

## 6. Los números de la entrega

| Métrica | Sano | Alerta | Acción |
|---|---|---|---|
| Llegada a bandeja | 80% o más | menos de 60% | **Parar todo.** Ningún texto arregla esto |
| Rebote | menos de 3% | más de 5% | Verificar la lista (`listas.md` §3) |
| Reportes de spam | menos de 0.1% | más de 0.3% | Apagar el dominio, solo calentamiento 30 días |

Para medir la llegada: unas cuantas cuentas de prueba propias (de distintos proveedores) dentro de cada lote; se revisa
si cayeron en bandeja o en spam. Sin eso la entrega está «sin medir», no «bien».

**Cuando un dominio se quema:** se pausa, se deja solo en calentamiento 30 días y se sigue con los otros. No se sigue
enviando desde un dominio quemado «a ver si aguanta».

**Diversificar cuando haya volumen:** con decenas de buzones, todo en el proveedor que mejor esté en ese momento; con
cientos, repartir entre proveedores. El que va mejor cambia cada año y un cambio de reglas puede tumbar la entrega de
toda la industria en días.

## 7. Checklist de arranque

- [ ] Dimensionar con la lista (`listas.md` §7)
- [ ] Comprar los dominios secundarios (con el sí del dueño)
- [ ] SPF, DKIM y DMARC en cada uno, comprobados
- [ ] Crear los buzones
- [ ] Activar calentamiento y anotar la fecha en `plan.md`
- [ ] Definir la identidad de operador (quién firma)
- [ ] Crear el registro de contactados (`frio.py agregar` con el primer negocio)
