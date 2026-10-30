export const LOCATION_REFRESH_MS = 5 * 60_000;
export const LOCATION_FIX_TIMEOUT_MS = 20_000;
export const LOCATION_FOREGROUND_MS = 15_000;
export const locationDeviceKey = row => JSON.stringify([row?.user_id||null,row?.device_id||row?.id||null]);
export const captureTime = row => row?.captured_at || row?.updated_at || null;
export function captureMillis(row) { const time=Date.parse(captureTime(row)||'');return Number.isFinite(time)?time:0; }
export function speedKmh(speed) {return typeof speed==='number'&&Number.isFinite(speed)&&speed>=0?Math.round(speed*36)/10:null;}
export function locationBatteryLabel(row) {
  const level=row?.battery_level;
  return typeof level==='number'&&Number.isFinite(level)&&level>=0&&level<=100?`${Math.round(level)}%${row.battery_charging===true?' · carregando':''}`:'Não informada';
}
export function locationSpeedLabel(row) {const speed=speedKmh(row?.speed);return speed===null?'Não informada':`${speed.toLocaleString('pt-BR')} km/h`;}
export function locationCaptureLabel(row) {const time=captureMillis(row);return time?new Date(time).toLocaleString('pt-BR'):'Sem horário registrado';}
export function locationAccuracyLabel(row){const accuracy=row?.accuracy;return typeof accuracy==='number'&&Number.isFinite(accuracy)&&accuracy>=0?`Precisão: ±${Math.max(1,Math.round(accuracy))} m`:'Precisão não informada';}
export function locationAgeLabel(row,now=Date.now()) {
  const time=captureMillis(row);if(!time)return 'Sem horário';
  const minutes=Math.floor(Math.max(0,now-time)/60_000);
  if(minutes===0)return 'Agora';if(minutes<60)return `Há ${minutes} min`;
  if(minutes<1440)return `Há ${Math.floor(minutes/60)} h`;
  return `Há ${Math.floor(minutes/1440)} dia(s)`;
}
export function isStaleLocation(row,now=Date.now()) {return !captureMillis(row)||now-captureMillis(row)>LOCATION_REFRESH_MS*2;}
export function zoneDisplayName(name) {return String(name||'Local').replace(/^\s*zona\s+segura\s*[-:–]?\s*/i,'').trim()||'Local';}
export function zoneAlertMessage(alert) {
  const data=alert?.data||{},name=data.member_name||data.child_name;
  if(!name||!['zone_enter','zone_exit'].includes(alert.type))return alert.message||'Alerta de localização';
  const date=Date.parse(data.occurred_at||'');
  return `${name} ${alert.type==='zone_enter'?'entrou em':'saiu de'} ${zoneDisplayName(data.zone_name)}${Number.isFinite(date)?` em ${new Date(date).toLocaleString('pt-BR')}`:''}.`;
}
export function latestLocationFix(locations) {
  return (locations||[]).filter(f=>Number.isFinite(f?.timestamp)&&Number.isFinite(f?.coords?.latitude)&&Number.isFinite(f?.coords?.longitude))
    .reduce((latest,fix)=>!latest||fix.timestamp>latest.timestamp?fix:latest,null);
}
/** @param {any} fix @param {any} context @param {string} deviceId @param {any} power @param {number} now */
export function buildLocationPayload(fix,context,deviceId,power=null,now=Date.now()) {
  const c=fix?.coords,t=fix?.timestamp;
  if(!Number.isFinite(t)||t<=0||t>now+120_000||!Number.isFinite(c?.latitude)||Math.abs(c.latitude)>90||!Number.isFinite(c?.longitude)||Math.abs(c.longitude)>180)throw Error('A captura do GPS é inválida. Verifique o horário e o GPS do aparelho.');
  const validNumber=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
  const level=power?.batteryLevel;
  const freshBattery=Math.abs(now-t)<60_000&&typeof level==='number'&&Number.isFinite(level)&&level>=0&&level<=1;
  return {family_id:context.familyId,user_id:context.userId,device_id:deviceId,latitude:c.latitude,longitude:c.longitude,
    accuracy:validNumber(c.accuracy),speed:validNumber(c.speed),heading:validNumber(c.heading),source:'gps_v2',
    captured_at:new Date(t).toISOString(),updated_at:new Date(now).toISOString(),
    battery_level:freshBattery?Math.round(level*100):null,battery_charging:freshBattery&&[1,2,3,4].includes(power.batteryState)?[2,3].includes(power.batteryState):null,
    share_with_children:context.shareWithChildren!==false,status:validNumber(c.speed)!==null&&c.speed>1.5?'moving':'stationary'};
}
