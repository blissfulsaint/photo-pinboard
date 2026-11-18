export function parseCaptureDate(value,offset) {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value))throw new Error('Enter a valid capture date and time.');
 if(typeof offset!=='string'||!/^[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00)$/.test(offset))throw new Error('Enter a UTC offset in ±HH:MM format, such as +00:00.');
 const local=value.length===16?value+':00':value;
 const calendar=new Date(local+'Z'),instant=new Date(local+offset);
 if(!Number.isFinite(calendar.getTime())||!Number.isFinite(instant.getTime())||calendar.toISOString().slice(0,19)!==local||local.startsWith('0000'))throw new Error('Enter a valid capture date and time.');
 return {exif:local.slice(0,10).replaceAll('-',':')+' '+local.slice(11),offset,iso:instant.toISOString()};
}
