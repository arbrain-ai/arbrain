/** Isolated HTTP runtime, no scheduler/cron startup and no external completion delivery. */
if(process.env.ARBRAIN_LIVE_CANARY!=='1'||!process.env.MC_SERVER_PORT||process.env.MC_SERVER_PORT==='3099')throw new Error('Use an explicit isolated port and ARBRAIN_LIVE_CANARY=1.')
const {initDatabase}=await import('../db.js')
const {startMCServer}=await import('../server.js')
initDatabase();startMCServer()
