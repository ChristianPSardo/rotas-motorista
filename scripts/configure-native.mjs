import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const manifestPath = path.join(root,'android','app','src','main','AndroidManifest.xml');
if (fs.existsSync(manifestPath)) {
  let xml = fs.readFileSync(manifestPath,'utf8');
  const permissions = [
    'android.permission.INTERNET',
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.FOREGROUND_SERVICE',
    'android.permission.FOREGROUND_SERVICE_LOCATION',
    'android.permission.POST_NOTIFICATIONS'
  ];
  const missing = permissions.filter(p => !xml.includes(`android:name="${p}"`));
  if (missing.length) {
    const block = missing.map(p => `    <uses-permission android:name="${p}" />`).join('\n') + '\n';
    xml = xml.replace(/<application\b/, `${block}\n    <application`);
    fs.writeFileSync(manifestPath, xml, 'utf8');
  }
}
