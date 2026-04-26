const { SerialPort } = require('serialport');
SerialPort.list().then(ports => {
    console.log('--- AVAILABLE PORTS ---');
    ports.forEach(p => {
        console.log(`Port: ${p.path}`);
        console.log(`  Manufacturer: ${p.manufacturer}`);
        console.log(`  FriendlyName: ${p.friendlyName}`);
        console.log(`  pnpId: ${p.pnpId}`);
        console.log('-------------------');
    });
}).catch(err => {
    console.error('Error listing ports:', err);
});
