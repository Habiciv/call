// Conservative, per-peer budget. Missing stats keep the existing mesh budget.
export function adaptiveBudget(current:number,cap:number,available?:number,rtt=0){
 const floor=Math.min(300000,cap);
 if(typeof available==='number'&&Number.isFinite(available)&&available>0) return Math.round(Math.max(floor,Math.min(cap,available*.65,current*1.12)));
 if(rtt>.45)return Math.round(Math.max(floor,current*.75));
 return Math.round(Math.min(cap,current*1.08));
}
