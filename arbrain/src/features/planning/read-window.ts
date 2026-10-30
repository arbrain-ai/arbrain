export interface ReadRange { from:string; to:string; includeCompleted?:string }
export function coversRange(outer:ReadRange,inner:ReadRange,marginDays=0) {
  const margin=marginDays*86400000
  return Date.parse(outer.from)<=Date.parse(inner.from)-margin && Date.parse(outer.to)>=Date.parse(inner.to)+margin
    && (inner.includeCompleted!=='true'||outer.includeCompleted==='true')
}
/** Reserve neighboring days without exceeding the provider's 65-day limit. */
export function bufferedRange(range:ReadRange,days:number):ReadRange {
  const span=(Date.parse(range.to)-Date.parse(range.from))/86400000
  const padding=Math.max(0,Math.min(days,Math.floor((64-span)/2)))*86400000
  return {...range,from:new Date(Date.parse(range.from)-padding).toISOString(),to:new Date(Date.parse(range.to)+padding).toISOString()}
}
