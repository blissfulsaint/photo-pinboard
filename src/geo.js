export function parseCoordinates(input) {
 const raw = input.trim(); let text = raw;
 if (/^https?:/i.test(raw)) {
  let url; try { url = new URL(raw); } catch { throw new Error('That URL is not valid.'); }
  if (!/(^|\.)(google\.[a-z.]+|maps\.google\.[a-z.]+)$/.test(url.hostname)) throw new Error('Paste coordinates or a full Google Maps link. Open short links first.');
  const pin = url.href.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  text = pin ? pin[1]+','+pin[2] : (url.searchParams.get('query') || url.searchParams.get('q') || '');
  if (!text) throw new Error('No explicit pin coordinates found. Copy the pin coordinates; the map center is not sufficient.');
 }
 const match = text.match(/^\s*([+-]?\d+(?:\.\d+)?)\s*[,、]\s*([+-]?\d+(?:\.\d+)?)\s*$/);
 if (!match) throw new Error('Use decimal latitude, longitude — for example 35.0116, 135.7681.');
 const lat = Number(match[1]), lng = Number(match[2]);
 if (lat < -90 || lat > 90 || lng < -180 || lng > 180) throw new Error('Latitude must be −90 to 90; longitude −180 to 180.');
 return {lat,lng};
}
export function csvCell(value) { return '"' + String(value ?? '').replaceAll('"', '""') + '"'; }
